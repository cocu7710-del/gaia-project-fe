import { useState, useEffect, useMemo } from 'react';
import { roomApi, fleetApi } from '../api/client';
import { ResourceCalculator } from '../utils/resourceCalculator';
import type { TechTileInfo, FederationTileInfo, ArtifactInfo } from '../api/client';
import type { FleetShipAction } from '../types/turnActions';
import { useGameStore } from '../store/gameStore';
import { PLANET_COLORS } from '../constants/colors';
// PLANET_COLORS는 getPlanetTypeFromFaction과 함께 토큰 색상 계산에 사용
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { ARTIFACT_IMAGE_MAP } from '../constants/artifactImage';

import closeImg from '../assets/resource/Close.png';

// 함대 배경 이미지
import tfMarsImg from '@/assets/board/T.F_Mars.png';
import eclipseImg from '@/assets/board/Eclipse.png';
import rebellionImg from '@/assets/board/Revellion.png';
import twilightImg from '@/assets/board/Twilight.png';

// 함대별 이미지 매핑
const FLEET_IMAGES: Record<string, string> = {
  TF_MARS: tfMarsImg,
  ECLIPSE: eclipseImg,
  REBELLION: rebellionImg,
  TWILIGHT: twilightImg,
};

// ========== 함대별 위치 설정 ==========
interface SlotPosition {
  left: number;
  top: number;
}

interface ActionConfig {
  type: 'green' | 'purple' | 'yellow' | 'blue';
  left: number;
  top: number;
  color: string;
  code: string;
  description: string;
  cost: Record<string, number>;  // 사용 조건 (power, qic, credit, knowledge 등)
  gain: Record<string, number>;  // 획득 자원
}

interface FleetLayout {
  // 이미지 비율 (paddingTop %)
  aspectRatio: number;
  // 플레이어 토큰 위치 (1-4)
  playerTokens: SlotPosition[];
  // 액션 버튼
  actions: ActionConfig[];
  // 연방 토큰
  federationToken: SlotPosition;
  // 기술 타일 위치
  techTile: SlotPosition | null;
  // 기술 타일 position (API에서 조회할 때 사용)
  techTilePosition?: number; // TF_MARS: 10, ECLIPSE: 11, REBELLION: 12
  // 인공물 슬롯 (TWILIGHT 전용)
  artifacts?: SlotPosition[];
}

// 기술 트랙 목록 (ECLIPSE_TECH 트랙 선택용)
const TECH_TRACKS = [
  { code: 'TERRA_FORMING', label: '테라포밍' },
  { code: 'NAVIGATION',    label: '항법' },
  { code: 'AI',            label: 'AI' },
  { code: 'GAIA_FORMING',  label: '가이아포밍' },
  { code: 'ECONOMY',       label: '경제' },
  { code: 'SCIENCE',       label: '과학' },
];

// 함대 버튼 코드 → FleetShipAction 메타 매핑
const FLEET_ACTION_FSA_META: Record<string, {
  fshCode: string;
  fleetName: string;
  isImmediate: boolean;
  needsGaiaformHex?: boolean;
  needsAsteroidHex?: boolean;
  needsUpgradeMineToTs?: boolean;
  needsTsToRl?: boolean;
  needsTrack?: boolean;
  needsTile?: boolean;
  terraformDiscount?: number;
  navBonus?: number;
}> = {
  FLEET_TF_MARS_1:   { fshCode: 'TF_MARS_VP',        fleetName: 'TF_MARS',   isImmediate: true },
  FLEET_TF_MARS_2:   { fshCode: 'TF_MARS_GAIAFORM',  fleetName: 'TF_MARS',   isImmediate: true, needsGaiaformHex: true },
  FLEET_TF_MARS_3:   { fshCode: 'TF_MARS_TERRAFORM', fleetName: 'TF_MARS',   isImmediate: false, terraformDiscount: 1 },
  FLEET_ECLIPSE_1:   { fshCode: 'ECLIPSE_VP',         fleetName: 'ECLIPSE',   isImmediate: true },
  FLEET_ECLIPSE_2:   { fshCode: 'ECLIPSE_TECH',       fleetName: 'ECLIPSE',   isImmediate: true, needsTrack: true },
  FLEET_ECLIPSE_3:   { fshCode: 'ECLIPSE_MINE',       fleetName: 'ECLIPSE',   isImmediate: true, needsAsteroidHex: true },
  FLEET_REBELLION_1: { fshCode: 'REBELLION_TECH',     fleetName: 'REBELLION', isImmediate: true, needsTile: true },
  FLEET_REBELLION_2: { fshCode: 'REBELLION_UPGRADE',  fleetName: 'REBELLION', isImmediate: true, needsUpgradeMineToTs: true },
  FLEET_REBELLION_3: { fshCode: 'REBELLION_CONVERT',  fleetName: 'REBELLION', isImmediate: true },
  FLEET_TWILIGHT_1:  { fshCode: 'TWILIGHT_FED',       fleetName: 'TWILIGHT',  isImmediate: true },
  FLEET_TWILIGHT_2:  { fshCode: 'TWILIGHT_UPGRADE',   fleetName: 'TWILIGHT',  isImmediate: true, needsTsToRl: true },
  FLEET_TWILIGHT_3:  { fshCode: 'TWILIGHT_NAV',       fleetName: 'TWILIGHT',  isImmediate: false, navBonus: 3 },
};

const FLEET_LAYOUTS: Record<string, FleetLayout> = {
  TF_MARS: {
    aspectRatio: 28,
    playerTokens: [
      { left: 21.5, top: 25 },
      { left: 21.5, top: 45 },
      { left: 21.5, top: 64 },
      { left: 21.5, top: 84 },
    ],
    actions: [
      { type: 'green',  left: 37.5, top: 38, color: '#22c55e', code: 'FLEET_TF_MARS_1', description: 'QIC 2 → 보유 기술 타일당 1VP + 2VP',          cost: { qic: 2 },    gain: {} },
      { type: 'purple', left: 49,   top: 38, color: '#a855f7', code: 'FLEET_TF_MARS_2', description: '파워 2 → 즉시 가이아 포밍 (가이아 포머)',         cost: { power: 2 },  gain: {} },
      { type: 'yellow', left: 60,   top: 38, color: '#eab308', code: 'FLEET_TF_MARS_3', description: '크레딧 3 → 테라포밍 1',                         cost: { credit: 3 }, gain: {} },
    ],
    federationToken: { left: 69.5, top: 77 },
    techTile: { left: 82, top: 50 },
    techTilePosition: 10,
  },
  ECLIPSE: {
    aspectRatio: 28,
    playerTokens: [
      { left: 29.3, top: 25 },
      { left: 29.3, top: 45 },
      { left: 29.3, top: 64 },
      { left: 29.3, top: 84 },
    ],
    actions: [
      { type: 'green',  left: 41,   top: 45, color: '#22c55e', code: 'FLEET_ECLIPSE_1', description: 'QIC 2 → 보유 행성 종류당 1VP + 2VP',  cost: { qic: 2 },    gain: {} },
      { type: 'purple', left: 52,   top: 45, color: '#a855f7', code: 'FLEET_ECLIPSE_2', description: '파워 3, 지식 2 → 지식 트랙 전진',     cost: { power: 3, knowledge: 2 }, gain: {} },
      { type: 'yellow', left: 63.5, top: 45, color: '#eab308', code: 'FLEET_ECLIPSE_3', description: '크레딧 6 → 소행성에 무료 광산',        cost: { credit: 6 }, gain: {} },
    ],
    federationToken: { left: 69.5, top: 79 },
    techTile: { left: 80, top: 38 },
    techTilePosition: 11,
  },
  REBELLION: {
    aspectRatio: 28,
    playerTokens: [
      { left: 20.5, top: 25 },
      { left: 20.5, top: 45 },
      { left: 20.5, top: 64 },
      { left: 20.5, top: 84 },
    ],
    actions: [
      { type: 'green',  left: 35.5, top: 60, color: '#22c55e', code: 'FLEET_REBELLION_1', description: 'QIC 3 → 기본 기술 타일 가져오기',              cost: { qic: 3 },              gain: {} },
      { type: 'purple', left: 47,   top: 60, color: '#a855f7', code: 'FLEET_REBELLION_2', description: '파워 3, 광석 1 → 광산을 교역소로 업그레이드', cost: { power: 3, ore: 1 },    gain: {} },
      { type: 'blue',   left: 58,   top: 60, color: '#3b82f6', code: 'FLEET_REBELLION_3', description: '지식 2 → QIC 1, 크레딧 2 획득',               cost: { knowledge: 2 },        gain: { qic: 1, credit: 2 } },
    ],
    federationToken: { left: 68.5, top: 65 },
    techTile: { left: 83, top: 51 },
    techTilePosition: 12,
  },
  TWILIGHT: {
    aspectRatio: 28,
    playerTokens: [
      { left: 22.5, top: 25 },
      { left: 22.5, top: 45 },
      { left: 22.5, top: 64 },
      { left: 22.5, top: 84 },
    ],
    actions: [
      { type: 'green',  left: 33, top: 54, color: '#22c55e', code: 'FLEET_TWILIGHT_1', description: 'QIC 3 → 보유한 연방 토큰 보상 1회 받기',          cost: { qic: 3 },           gain: {} },
      { type: 'purple', left: 44, top: 54, color: '#a855f7', code: 'FLEET_TWILIGHT_2', description: '파워 3, 광석 2 → 교역소를 연구소로 업그레이드', cost: { power: 3, ore: 2 }, gain: {} },
      { type: 'blue',   left: 55, top: 54, color: '#3b82f6', code: 'FLEET_TWILIGHT_3', description: '지식 1 → 즉시 +3 항해 거리 사용',                cost: { knowledge: 1 },     gain: {} },
    ],
    federationToken: { left: 61, top: 82 },
    techTile: null,
    // 인공물 슬롯 4개 (오른쪽 타원형)
    artifacts: [
      { left: 75, top: 28 },
      { left: 92, top: 28 },
      { left: 75, top: 76 },
      { left: 92, top: 73 },
    ],
  },
};

// 종족 코드 → 행성 타입 (TechTracks와 동일)
function getPlanetTypeFromFaction(factionCode: string | null): string {
  if (!factionCode) return 'TERRA';
  const map: Record<string, string> = {
    TERRANS: 'TERRA', LANTIDS: 'TERRA',
    HADSCH_HALLAS: 'DESERT', IVITS: 'DESERT',
    TAKLONS: 'SWAMP', AMBAS: 'SWAMP',
    GEODENS: 'VOLCANIC', BAL_TAKS: 'VOLCANIC',
    GLEENS: 'OXIDE', XENOS: 'OXIDE',
    FIRAKS: 'TITANIUM', BESCODS: 'TITANIUM',
    ITARS: 'ICE', NEVLAS: 'ICE',
  };
  return map[factionCode] || 'TERRA';
}

// ========== 인터페이스 ==========
interface FederationTilesProps {
  roomId: string;
  playerStates?: { playerId: string; factionCode: string | null }[];
}

interface PlayerToken {
  slot: number;
  seatNo: number | null;
  color: string | null;
  isTentative?: boolean;
}

interface ActionSlot {
  type: 'green' | 'purple' | 'yellow' | 'blue';
  usedThisRound: boolean;
  usedBySeatNo: number | null;
}

interface ArtifactSlot {
  slot: number;
  artifactCode: string | null;
  isTaken?: boolean;
}

interface Spaceship {
  id: number;
  name: string;
  fleetCode: string;
  playerTokens: PlayerToken[];
  actions: ActionSlot[];
  techTile: TechTileInfo | null;
  federationToken: string | null;
  artifacts: ArtifactSlot[]; // 인공물 (TWILIGHT 전용)
}

// ========== 헬퍼 ==========
function createDefaultShip(id: number, name: string, fleetCode: string): Spaceship {
  const layout = FLEET_LAYOUTS[fleetCode];
  return {
    id,
    name,
    fleetCode,
    playerTokens: [
      { slot: 1, seatNo: null, color: null },
      { slot: 2, seatNo: null, color: null },
      { slot: 3, seatNo: null, color: null },
      { slot: 4, seatNo: null, color: null },
    ],
    actions: layout.actions.map((a) => ({
      type: a.type,
      usedThisRound: false,
      usedBySeatNo: null,
    })),
    techTile: null,
    federationToken: null,
    artifacts: layout.artifacts
      ? layout.artifacts.map((_, idx) => ({ slot: idx + 1, artifactCode: null }))
      : [],
  };
}

const DEFAULT_SPACESHIPS: Spaceship[] = [
  createDefaultShip(1, 'T.F. MARS', 'TF_MARS'),
  createDefaultShip(2, 'ECLIPSE', 'ECLIPSE'),
  createDefaultShip(3, 'REBELLION', 'REBELLION'),
  createDefaultShip(4, 'TWILIGHT', 'TWILIGHT'),
];

// ========== 메인 컴포넌트 ==========
export default function FederationTiles({ roomId, playerStates = [] }: FederationTilesProps) {
  const [spaceships, setSpaceships] = useState<Spaceship[]>(DEFAULT_SPACESHIPS);
  const [trackPickingFor, setTrackPickingFor] = useState<string | null>(null);
  const [tilePickingFor, setTilePickingFor] = useState<string | null>(null);
  const [availableTiles, setAvailableTiles] = useState<TechTileInfo[]>([]);
  const {
    fleetProbes, turnState, playerId: myPlayerId, setFleetProbes,
    usedPowerActionCodes, gamePhase, currentTurnSeatNo, mySeatNo, addPendingAction,
    fleetShipMode, setFleetShipMode,
  } = useGameStore();

  const isMyTurn = gamePhase === 'PLAYING' && mySeatNo !== null && mySeatNo === currentTurnSeatNo;
  const inFleetShipMode = fleetShipMode !== null;

  // playerId → 색상 매핑 (factionCode 기준 - 광산 색과 동일)
  const playerIdToColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ps of playerStates) {
      const planetType = getPlanetTypeFromFaction(ps.factionCode);
      map[ps.playerId] = PLANET_COLORS[planetType] || '#ffffff';
    }
    return map;
  }, [playerStates]);

  // 현재 pending FLEET_PROBE 액션
  const pendingFleetProbe = turnState.pendingActions.find(a => a.type === 'FLEET_PROBE');

  // 함대별 playerToken 배열 계산 (실제 + 임시)
  const getPlayerTokensForFleet = (fleetCode: string): PlayerToken[] => {
    const probeIds = fleetProbes[fleetCode] || [];

    const tokens: PlayerToken[] = [1, 2, 3, 4].map(slot => {
      const pid = probeIds[slot - 1];
      return {
        slot,
        seatNo: null,
        color: pid ? (playerIdToColor[pid] ?? null) : null,
      };
    });

    // 임시(pending) 토큰 - 초기화 시 사라짐
    // probeIds.length = 확정된 입장 수 → 다음 빈 슬롯에 배치
    if (pendingFleetProbe?.payload.fleetName === fleetCode && myPlayerId) {
      const nextIdx = probeIds.length; // 0-based
      if (nextIdx < 4) {
        tokens[nextIdx] = {
          slot: nextIdx + 1,
          seatNo: null,
          color: playerIdToColor[myPlayerId] ?? null,
          isTentative: true,
        };
      }
    }

    return tokens;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        // 기술 타일 + 연방 토큰 + 함대 점유 동시 로드
        const [techRes, fedRes, fleetRes] = await Promise.all([
          roomApi.getTechTracks(roomId),
          roomApi.getFederationTiles(roomId),
          fleetApi.getFleetOccupancy(roomId),
        ]);
        setFleetProbes(fleetRes.data.probesByFleet);

        const basicTiles = techRes.data.basicTiles;
        const fleetTokens = fedRes.data.forgottenFleet;
        const artifacts = fedRes.data.artifacts || [];

        setSpaceships((prev) =>
          prev.map((ship, idx) => {
            const layout = FLEET_LAYOUTS[ship.fleetCode];

            // 기술 타일 매칭
            let techTile: TechTileInfo | null = null;
            if (layout.techTilePosition) {
              techTile = basicTiles.find((t) => t.position === layout.techTilePosition) || null;
            }

            // 연방 토큰 매칭 (position이 ship.id와 같거나, 배열 순서대로)
            const fedToken = fleetTokens.find((t) => t.position === ship.id)
              || fleetTokens[idx]
              || null;

            // 인공물 매칭 (TWILIGHT만)
            let artifactSlots: ArtifactSlot[] = ship.artifacts;
            if (ship.fleetCode === 'TWILIGHT' && artifacts.length > 0) {
              artifactSlots = artifacts.map((art: ArtifactInfo) => ({
                slot: art.position,
                artifactCode: art.artifactCode,
                isTaken: art.isTaken,
              }));
            }

            return {
              ...ship,
              techTile,
              federationToken: fedToken?.tileCode || null,
              artifacts: artifactSlots,
            };
          })
        );
      } catch (err) {
        console.error('데이터 로드 실패:', err);
      }
    };
    loadData();
  }, [roomId]);

  // 타일 선택 모드 진입 시 가능한 타일 로드
  useEffect(() => {
    if (tilePickingFor && roomId) {
      roomApi.getTechTracks(roomId).then(res => {
        setAvailableTiles(res.data.basicTiles.filter((t: TechTileInfo) => !t.isTaken));
      }).catch(() => setAvailableTiles([]));
    }
  }, [tilePickingFor, roomId]);

  // pending 중인 함대 액션 코드 (old POWER_ACTION 방식 + 새 FLEET_SHIP_ACTION 방식 모두 추적)
  const usedInPending = turnState.pendingActions
    .filter(a => a.type === 'POWER_ACTION')
    .map(a => a.payload.powerActionCode as string);
  const usedCodes = new Set([...usedPowerActionCodes, ...usedInPending]);
  const hasPendingAction = turnState.pendingActions.length > 0;

  const currentPlayerState = turnState.previewPlayerState ?? null;

  const handleActionClick = (fleetCode: string, config: ActionConfig) => {
    if (!isMyTurn || hasPendingAction || inFleetShipMode || usedCodes.has(config.code)) return;
    if (!myPlayerId || !(fleetProbes[fleetCode] || []).includes(myPlayerId)) return;
    if (currentPlayerState && !ResourceCalculator.canAfford(currentPlayerState as any, config.cost)) return;

    const meta = FLEET_ACTION_FSA_META[config.code];
    if (!meta) return; // 정의되지 않은 액션 무시

    if (meta.needsTrack) {
      setTrackPickingFor(config.code);
      return;
    }

    if (meta.needsTile) {
      setTilePickingFor(config.code);
      return;
    }

    if (meta.needsGaiaformHex || meta.needsAsteroidHex || meta.needsUpgradeMineToTs || meta.needsTsToRl) {
      setFleetShipMode({
        actionCode: meta.fshCode,
        fleetName: meta.fleetName,
        cost: config.cost,
        needsGaiaformHex: meta.needsGaiaformHex,
        needsAsteroidHex: meta.needsAsteroidHex,
        needsUpgradeMineToTs: meta.needsUpgradeMineToTs,
        needsTsToRl: meta.needsTsToRl,
      });
      return;
    }

    // 즉시(immediate) 또는 split(terraform/nav) 액션 → FLEET_SHIP_ACTION pending 추가
    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: {
        fleetName: meta.fleetName,
        actionCode: meta.fshCode,
        cost: config.cost,
        isImmediate: meta.isImmediate,
        terraformDiscount: meta.terraformDiscount,
        navBonus: meta.navBonus,
      },
    };
    addPendingAction(action);
  };

  const handleTrackSelect = (actionCode: string, trackCode: string) => {
    const meta = FLEET_ACTION_FSA_META[actionCode];
    // 비용은 레이아웃에서 가져옴
    const config = Object.values(FLEET_LAYOUTS).flatMap(l => l.actions).find(a => a.code === actionCode);
    if (!meta || !config) return;
    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: { fleetName: meta.fleetName, actionCode: meta.fshCode, cost: config.cost, isImmediate: true, trackCode },
    };
    addPendingAction(action);
    setTrackPickingFor(null);
  };

  const handleTileSelect = (actionCode: string, tileCode: string) => {
    const meta = FLEET_ACTION_FSA_META[actionCode];
    const config = Object.values(FLEET_LAYOUTS).flatMap(l => l.actions).find(a => a.code === actionCode);
    if (!meta || !config) return;
    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: { fleetName: meta.fleetName, actionCode: meta.fshCode, cost: config.cost, isImmediate: true, trackCode: tileCode },
    };
    addPendingAction(action);
    setTilePickingFor(null);
    setAvailableTiles([]);
  };

  return (
    <div className="game-panel">
      <div className="flex flex-col gap-2">
        {spaceships.map((ship) => {
          const hasEntered = !!(myPlayerId && (fleetProbes[ship.fleetCode] || []).includes(myPlayerId));
          return (
          <SpaceshipCard
            key={ship.id}
            ship={{ ...ship, playerTokens: getPlayerTokensForFleet(ship.fleetCode) }}
            hasEntered={hasEntered}
            canAct={isMyTurn && !hasPendingAction && !inFleetShipMode}
            usedCodes={usedCodes}
            currentPlayerState={currentPlayerState as any}
            onActionClick={(config) => handleActionClick(ship.fleetCode, config)}
          />
          );
        })}
      </div>

      {/* 헥스 선택 모드 안내 */}
      {inFleetShipMode && (
        <div className="mt-1.5 p-1.5 bg-amber-900/50 border border-amber-600/30 rounded-lg text-[9px] text-amber-200">
          맵에서 대상 위치를 선택하세요 ({fleetShipMode!.actionCode})
          <button
            onClick={() => setFleetShipMode(null)}
            className="ml-2 text-gray-400 hover:text-white underline"
          >
            취소
          </button>
        </div>
      )}

      {/* 기술 트랙 선택 (ECLIPSE_TECH) */}
      {trackPickingFor && (
        <div className="mt-1.5 p-1.5 bg-blue-900/50 border border-blue-600/30 rounded-lg text-[9px]">
          <div className="text-blue-300 font-semibold mb-1">기술 트랙 선택:</div>
          <div className="flex flex-wrap gap-1">
            {TECH_TRACKS.map(t => (
              <button
                key={t.code}
                onClick={() => handleTrackSelect(trackPickingFor, t.code)}
                className="px-1.5 py-0.5 bg-blue-700/70 hover:bg-blue-600/70 text-white rounded-md cursor-pointer"
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setTrackPickingFor(null)}
              className="px-1.5 py-0.5 bg-gray-600/60 hover:bg-gray-500/60 text-white rounded-md cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 기술 타일 선택 (REBELLION_TECH) */}
      {tilePickingFor && (
        <div className="mt-1.5 p-1.5 bg-emerald-900/50 border border-emerald-600/30 rounded-lg text-[9px]">
          <div className="text-emerald-300 font-semibold mb-1">기술 타일 선택:</div>
          <div className="flex flex-wrap gap-1">
            {availableTiles.length === 0 ? (
              <span className="text-gray-400">가져갈 수 있는 타일 없음</span>
            ) : availableTiles.map(t => (
              <button
                key={t.tileCode}
                onClick={() => handleTileSelect(tilePickingFor, t.tileCode)}
                title={t.description}
                className="px-1.5 py-0.5 bg-emerald-700/70 hover:bg-emerald-600/70 text-white rounded-md cursor-pointer"
              >
                {t.tileCode.replace('BASIC_', '')}
              </button>
            ))}
            <button
              onClick={() => { setTilePickingFor(null); setAvailableTiles([]); }}
              className="px-1.5 py-0.5 bg-gray-600/60 hover:bg-gray-500/60 text-white rounded-md cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 우주선 카드 ==========
interface SpaceshipCardProps {
  ship: Spaceship;
  hasEntered: boolean;
  canAct: boolean;
  usedCodes: Set<string>;
  currentPlayerState: any | null;
  onActionClick: (config: ActionConfig) => void;
}

function SpaceshipCard({ ship, hasEntered, canAct, usedCodes, currentPlayerState, onActionClick }: SpaceshipCardProps) {
  const bgImage = FLEET_IMAGES[ship.fleetCode];
  const layout = FLEET_LAYOUTS[ship.fleetCode];

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-700/40">
      <div className="relative w-full" style={{ paddingTop: `${layout.aspectRatio}%` }}>
        <img
          src={bgImage}
          alt={ship.name}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <PlayerTokenSlots tokens={ship.playerTokens} positions={layout.playerTokens} />
        <ActionButtons
          layout={layout}
          hasEntered={hasEntered}
          canAct={canAct}
          usedCodes={usedCodes}
          currentPlayerState={currentPlayerState}
          onActionClick={onActionClick}
        />
        <FederationTokenSlot tokenCode={ship.federationToken} position={layout.federationToken} />
        {layout.techTile && (
          <TechTileSlot techTile={ship.techTile} position={layout.techTile} />
        )}
        {layout.artifacts && (
          <ArtifactSlots artifacts={ship.artifacts} positions={layout.artifacts} />
        )}
      </div>
    </div>
  );
}

// ========== 플레이어 토큰 슬롯 ==========
interface PlayerTokenSlotsProps {
  tokens: PlayerToken[];
  positions: SlotPosition[];
}

function PlayerTokenSlots({ tokens, positions }: PlayerTokenSlotsProps) {
  return (
    <>
      {positions.map((pos, idx) => {
        const token = tokens.find((t) => t.slot === idx + 1);
        const hasPlayer = token?.color !== null && token?.color !== undefined;

        return (
          <div
            key={idx}
            className="absolute flex items-center justify-center"
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: '5%',
              height: '16%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {hasPlayer ? (
              <div
                className="w-full h-full rounded-full border-2 border-white"
                style={{
                  backgroundColor: token!.color!,
                  opacity: token!.isTentative ? 0.75 : 1,
                  borderStyle: token!.isTentative ? 'dashed' : 'solid',
                }}
              />
            ) : (
              <div className="w-full h-full rounded-full border border-white/30 bg-black/20" />
            )}
          </div>
        );
      })}
    </>
  );
}

// ========== 액션 버튼 ==========
interface ActionButtonsProps {
  layout: FleetLayout;
  hasEntered: boolean;
  canAct: boolean;
  usedCodes: Set<string>;
  currentPlayerState: any | null;
  onActionClick: (config: ActionConfig) => void;
}

function ActionButtons({ layout, hasEntered, canAct, usedCodes, currentPlayerState, onActionClick }: ActionButtonsProps) {
  return (
    <>
      {layout.actions.map((config) => {
        const isUsed = usedCodes.has(config.code);
        const affordable = !currentPlayerState || ResourceCalculator.canAfford(currentPlayerState, config.cost);
        const canClick = hasEntered && canAct && !isUsed && affordable;

        return (
          <button
            key={config.type}
            onClick={() => canClick && onActionClick(config)}
            disabled={!canClick}
            className={`absolute transition-all rounded ${
              !hasEntered
                ? 'bg-black/60 cursor-not-allowed'
                : isUsed
                  ? 'bg-black/50 cursor-not-allowed'
                  : !affordable
                    ? 'bg-black/40 cursor-not-allowed'
                    : canClick
                      ? 'hover:bg-white/20 cursor-pointer'
                      : 'cursor-default'
            }`}
            style={{
              left: `${config.left}%`,
              top: `${config.top}%`,
              width: '10%',
              height: '40%',
              transform: 'translate(-50%, -50%)',
            }}
            title={
              !hasEntered ? `${config.description} (미입장)` :
              isUsed ? `${config.description} (사용됨)` :
              !affordable ? `${config.description} (자원 부족)` :
              config.description
            }
          >
            {!hasEntered && (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-500 font-bold text-sm">🔒</span>
              </div>
            )}
            {hasEntered && isUsed && (
              <div className="w-full h-full flex items-center justify-center">
                <img src={closeImg} className="w-12 h-12 object-contain" draggable={false} />
              </div>
            )}
          </button>
        );
      })}
    </>
  );
}

// ========== 기술 타일 슬롯 ==========
interface TechTileSlotProps {
  techTile: TechTileInfo | null;
  position: SlotPosition;
}

function TechTileSlot({ techTile, position }: TechTileSlotProps) {
  const imgSrc = techTile ? TECH_TILE_IMAGE_MAP[techTile.tileCode] : null;

  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
        width: '18%',
        height: '70%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {techTile ? (
        <div
          className={`w-full h-full rounded overflow-hidden ${techTile.isTaken ? 'opacity-50' : ''}`}
          title={techTile.description}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={techTile.tileCode}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-amber-600/80 border border-amber-400 rounded flex items-center justify-center">
              <span className="text-[7px] text-white font-bold">
                {techTile.tileCode}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full rounded border border-white/20 bg-black/10" />
      )}
    </div>
  );
}

// ========== 연방 토큰 슬롯 ==========
interface FederationTokenSlotProps {
  tokenCode: string | null;
  position: SlotPosition;
}

function FederationTokenSlot({ tokenCode, position }: FederationTokenSlotProps) {
  const imgSrc = tokenCode ? FEDERATION_TOKEN_IMAGE_MAP[tokenCode] : null;

  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
        width: '11%',
        height: '33%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {tokenCode ? (
        <div className="w-full h-full flex items-center justify-center">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={tokenCode}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            // 이미지 매핑이 없을 때 fallback (SVG)
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon
                points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
                fill="#6b7280"
                stroke="#9ca3af"
                strokeWidth="2"
              />
              <text x="50" y="55" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">
                {tokenCode.replace('FED_', '')}
              </text>
            </svg>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full opacity-30">
            <polygon
              points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
              fill="transparent"
              stroke="#9ca3af"
              strokeWidth="2"
              strokeDasharray="5,3"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

// ========== 인공물 슬롯 (TWILIGHT 전용) ==========
interface ArtifactSlotsProps {
  artifacts: ArtifactSlot[];
  positions: SlotPosition[];
}

function ArtifactSlots({ artifacts, positions }: ArtifactSlotsProps) {
  return (
    <>
      {positions.map((pos, idx) => {
        const artifact = artifacts.find((a) => a.slot === idx + 1);
        const hasArtifact = artifact?.artifactCode !== null;
        const imgSrc = artifact?.artifactCode ? ARTIFACT_IMAGE_MAP[artifact.artifactCode] : undefined;

        return (
          <div
            key={idx}
            className="absolute flex items-center justify-center"
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: '12%',
              height: '35%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {hasArtifact && imgSrc ? (
              <img
                src={imgSrc}
                alt={artifact?.artifactCode || ''}
                className={`w-full h-full object-contain ${artifact?.isTaken ? 'opacity-50 grayscale' : ''}`}
                draggable={false}
                title={artifact?.artifactCode || ''}
              />
            ) : hasArtifact ? (
              // fallback: 이미지 없을 때
              <div className="w-full h-full rounded-full bg-purple-600 border-2 border-purple-300 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">
                  {artifact?.artifactCode}
                </span>
              </div>
            ) : (
              // 빈 슬롯 (타원형)
              <div className="w-full h-full rounded-full border border-white/30 bg-black/20" />
            )}
          </div>
        );
      })}
    </>
  );
}
