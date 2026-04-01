import { useState, useEffect, useMemo } from 'react';
import { roomApi, fleetApi } from '../api/client';
import { ResourceCalculator } from '../utils/resourceCalculator';
import type { TechTileInfo, ArtifactInfo } from '../api/client';
import type { FleetShipAction } from '../types/turnActions';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/gameStore';
import { PLANET_COLORS } from '../constants/colors';
// PLANET_COLORS는 getPlanetTypeFromFaction과 함께 토큰 색상 계산에 사용
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { ARTIFACT_IMAGE_MAP } from '../constants/artifactImage';

import closeImg from '../assets/resource/Close.png';
import ufoImg from '../assets/resource/UFO.png';

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
  FLEET_TWILIGHT_1:  { fshCode: 'TWILIGHT_FED',       fleetName: 'TWILIGHT',  isImmediate: true, needsFederationToken: true },
  FLEET_TWILIGHT_2:  { fshCode: 'TWILIGHT_UPGRADE',   fleetName: 'TWILIGHT',  isImmediate: true, needsTsToRl: true },
  FLEET_TWILIGHT_3:  { fshCode: 'TWILIGHT_NAV',       fleetName: 'TWILIGHT',  isImmediate: false, navBonus: 3 },
};

const FLEET_LAYOUTS: Record<string, FleetLayout> = {
  TF_MARS: {
    aspectRatio: 24,
    playerTokens: [
      { left: 21.7, top: 22.6 },
      { left: 21.7, top: 42.6 },
      { left: 21.7, top: 61.6 },
      { left: 21.7, top: 81.6 },
    ],
    actions: [
      { type: 'green',  left: 37.5, top: 38, color: '#22c55e', code: 'FLEET_TF_MARS_1', description: 'QIC 2 → 보유 기술 타일당 1VP + 2VP',          cost: { qic: 2 },    gain: {} },
      { type: 'purple', left: 49,   top: 38, color: '#a855f7', code: 'FLEET_TF_MARS_2', description: '파워 2 → 즉시 가이아 포밍 (가이아 포머)',         cost: { power: 2 },  gain: {} },
      { type: 'yellow', left: 60,   top: 38, color: '#eab308', code: 'FLEET_TF_MARS_3', description: '크레딧 3 → 테라포밍 1',                         cost: { credit: 3 }, gain: {} },
    ],
    federationToken: { left: 68, top: 80 },
    techTile: { left: 80, top: 45 },
    techTilePosition: 10,
  },
  ECLIPSE: {
    aspectRatio: 24,
    playerTokens: [
      { left: 29.5, top: 22.6 },
      { left: 29.5, top: 42.6 },
      { left: 29.5, top: 61.6 },
      { left: 29.5, top: 81.6 },
    ],
    actions: [
      { type: 'green',  left: 41,   top: 45, color: '#22c55e', code: 'FLEET_ECLIPSE_1', description: 'QIC 2 → 보유 행성 종류당 1VP + 2VP',  cost: { qic: 2 },    gain: {} },
      { type: 'purple', left: 52,   top: 45, color: '#a855f7', code: 'FLEET_ECLIPSE_2', description: '파워 3, 지식 2 → 지식 트랙 전진',     cost: { power: 3, knowledge: 2 }, gain: {} },
      { type: 'yellow', left: 63.5, top: 45, color: '#eab308', code: 'FLEET_ECLIPSE_3', description: '크레딧 6 → 소행성에 무료 광산',        cost: { credit: 6 }, gain: {} },
    ],
    federationToken: { left: 70, top: 85 },
    techTile: { left: 80, top: 38 },
    techTilePosition: 11,
  },
  REBELLION: {
    aspectRatio: 24,
    playerTokens: [
      { left: 20.7, top: 22.6 },
      { left: 20.7, top: 42.6 },
      { left: 20.7, top: 61.6 },
      { left: 20.7, top: 81.6 },
    ],
    actions: [
      { type: 'green',  left: 35.5, top: 60, color: '#22c55e', code: 'FLEET_REBELLION_1', description: 'QIC 3 → 기본 기술 타일 가져오기',              cost: { qic: 3 },              gain: {} },
      { type: 'purple', left: 47,   top: 60, color: '#a855f7', code: 'FLEET_REBELLION_2', description: '파워 3, 광석 1 → 광산을 교역소로 업그레이드', cost: { power: 3, ore: 1 },    gain: {} },
      { type: 'blue',   left: 58,   top: 60, color: '#3b82f6', code: 'FLEET_REBELLION_3', description: '지식 2 → QIC 1, 크레딧 2 획득',               cost: { knowledge: 2 },        gain: { qic: 1, credit: 2 } },
    ],
    federationToken: { left: 68.5, top: 71 },
    techTile: { left: 83, top: 51 },
    techTilePosition: 12,
  },
  TWILIGHT: {
    aspectRatio: 24,
    playerTokens: [
      { left: 22.7, top: 22.6 },
      { left: 22.7, top: 42.6 },
      { left: 22.7, top: 61.6 },
      { left: 22.7, top: 81.6 },
    ],
    actions: [
      { type: 'green',  left: 33, top: 54, color: '#22c55e', code: 'FLEET_TWILIGHT_1', description: 'QIC 3 → 보유한 연방 토큰 보상 1회 받기',          cost: { qic: 3 },           gain: {} },
      { type: 'purple', left: 44, top: 54, color: '#a855f7', code: 'FLEET_TWILIGHT_2', description: '파워 3, 광석 2 → 교역소를 연구소로 업그레이드', cost: { power: 3, ore: 2 }, gain: {} },
      { type: 'blue',   left: 55, top: 54, color: '#3b82f6', code: 'FLEET_TWILIGHT_3', description: '지식 1 → 즉시 +3 항해 거리 사용',                cost: { knowledge: 1 },     gain: {} },
    ],
    federationToken: { left: 62, top: 87 },
    techTile: null,
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
    HADSCH_HALLAS: 'VOLCANIC', IVITS: 'VOLCANIC',
    TAKLONS: 'SWAMP', AMBAS: 'SWAMP',
    GEODENS: 'OXIDE', BAL_TAKS: 'OXIDE',
    GLEENS: 'DESERT', XENOS: 'DESERT',
    FIRAKS: 'TITANIUM', BESCODS: 'TITANIUM',
    ITARS: 'ICE', NEVLAS: 'ICE',
    MOWEIDS: 'LOST_PLANET', SPACE_GIANTS: 'LOST_PLANET',
    TINKEROIDS: 'ASTEROIDS', DAKANIANS: 'ASTEROIDS',
  };
  return map[factionCode] || 'TERRA';
}

// ========== 인터페이스 ==========
interface FederationTilesProps {
  roomId: string;
  playerStates?: { playerId: string; factionCode: string | null }[];
  refreshKey?: number;
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
export default function FederationTiles({ roomId, playerStates = [], refreshKey = 0 }: FederationTilesProps) {
  const [spaceships, setSpaceships] = useState<Spaceship[]>(DEFAULT_SPACESHIPS);
  const {
    fleetProbes, turnState, playerId: myPlayerId, setFleetProbes,
    usedPowerActionCodes, gamePhase, currentTurnSeatNo, mySeatNo, addPendingAction,
    fleetShipMode, setFleetShipMode,
    tentativeTechTileCode, setTentativeTechTile,
    itarsGaiaChoice,
    setGameArtifacts,
    federationMode, setFederationMode,
  } = useGameStore(useShallow(s => ({
    fleetProbes: s.fleetProbes, turnState: s.turnState, playerId: s.playerId, setFleetProbes: s.setFleetProbes,
    usedPowerActionCodes: s.usedPowerActionCodes, gamePhase: s.gamePhase, currentTurnSeatNo: s.currentTurnSeatNo,
    mySeatNo: s.mySeatNo, addPendingAction: s.addPendingAction, fleetShipMode: s.fleetShipMode,
    setFleetShipMode: s.setFleetShipMode, tentativeTechTileCode: s.tentativeTechTileCode,
    itarsGaiaChoice: s.itarsGaiaChoice,
    setTentativeTechTile: s.setTentativeTechTile, setGameArtifacts: s.setGameArtifacts,
    federationMode: s.federationMode, setFederationMode: s.setFederationMode,
  })));

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
        // store에 인공물 데이터 저장 (SeatSelector에서 플레이어별 보유 표시)
        setGameArtifacts(artifacts.map((a: any) => ({
          artifactCode: a.artifactCode, position: a.position,
          isTaken: a.isTaken, acquiredByPlayerId: a.acquiredByPlayerId ?? null,
        })));

        setSpaceships((prev) =>
          prev.map((ship, idx) => {
            const layout = FLEET_LAYOUTS[ship.fleetCode];

            // 기술 타일 매칭
            let techTile: TechTileInfo | null = null;
            if (layout.techTilePosition) {
              const rawTile = basicTiles.find((t) => t.position === layout.techTilePosition) || null;
              techTile = rawTile ?? null;  // 함대 기술 타일은 4명 모두 가져갈 수 있음
            }

            // 연방 토큰 매칭 (position이 ship.id와 같거나, 배열 순서대로)
            // quantity === 0 이면 이미 가져간 것 → null로 처리
            const fedTokenRaw = fleetTokens.find((t) => t.position === ship.id)
              || fleetTokens[idx]
              || null;
            const fedToken = fedTokenRaw && fedTokenRaw.quantity > 0 ? fedTokenRaw : null;

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
  }, [roomId, refreshKey]);

  // 아이타 기술타일 선택 모드
  const isItarsTilePicking = itarsGaiaChoice?.tilePicking === true && itarsGaiaChoice.itarsPlayerId === myPlayerId;

  // 기술 타일 선택 모드 활성화 여부 (연구소/아카데미/리벨리온/스자PI/아이타 의회)
  const isTechPickActive = (isItarsTilePicking && !tentativeTechTileCode) || (isMyTurn && !tentativeTechTileCode && turnState.pendingActions.some(
    a => (a.type === 'UPGRADE_BUILDING' && (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY'
          || a.payload.toType === 'ACADEMY_KNOWLEDGE' || a.payload.toType === 'ACADEMY_QIC'
          || (a.payload.toType === 'PLANETARY_INSTITUTE' && a.payload.factionCode === 'SPACE_GIANTS')))
      || (a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'REBELLION_TECH' && !(a.payload as any).trackCode)
      || (a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'TWILIGHT_UPGRADE' && (a.payload as any).hexQ != null)
      || (a.type === 'FORM_FEDERATION' && a.payload.tileCode === 'FED_EXP_TILE_1')
  ));

  // pending 중인 파워 액션 + 함대 액션 코드 추적
  const usedInPending = turnState.pendingActions
    .filter(a => a.type === 'POWER_ACTION')
    .map(a => a.payload.powerActionCode as string);
  const usedFleetInPending = turnState.pendingActions
    .filter(a => a.type === 'FLEET_SHIP_ACTION')
    .map(a => {
      const actionCode = (a.payload as any).actionCode as string;
      // BE actionCode → FE FLEET_ 코드 매핑
      const map: Record<string, string> = {
        TF_MARS_VP: 'FLEET_TF_MARS_1', TF_MARS_GAIAFORM: 'FLEET_TF_MARS_2', TF_MARS_TERRAFORM: 'FLEET_TF_MARS_3',
        ECLIPSE_VP: 'FLEET_ECLIPSE_1', ECLIPSE_TECH: 'FLEET_ECLIPSE_2', ECLIPSE_MINE: 'FLEET_ECLIPSE_3',
        REBELLION_TECH: 'FLEET_REBELLION_1', REBELLION_UPGRADE: 'FLEET_REBELLION_2', REBELLION_CONVERT: 'FLEET_REBELLION_3',
        TWILIGHT_FED: 'FLEET_TWILIGHT_1', TWILIGHT_UPGRADE: 'FLEET_TWILIGHT_2', TWILIGHT_NAV: 'FLEET_TWILIGHT_3',
      };
      return map[actionCode] ?? actionCode;
    });
  const fleetCodeMap: Record<string, string> = {
    TF_MARS_VP: 'FLEET_TF_MARS_1', TF_MARS_GAIAFORM: 'FLEET_TF_MARS_2', TF_MARS_TERRAFORM: 'FLEET_TF_MARS_3',
    ECLIPSE_VP: 'FLEET_ECLIPSE_1', ECLIPSE_TECH: 'FLEET_ECLIPSE_2', ECLIPSE_MINE: 'FLEET_ECLIPSE_3',
    REBELLION_TECH: 'FLEET_REBELLION_1', REBELLION_UPGRADE: 'FLEET_REBELLION_2', REBELLION_CONVERT: 'FLEET_REBELLION_3',
    TWILIGHT_FED: 'FLEET_TWILIGHT_1', TWILIGHT_UPGRADE: 'FLEET_TWILIGHT_2', TWILIGHT_NAV: 'FLEET_TWILIGHT_3',
  };
  // BE에서 반환되는 usedPowerActionCodes에 함대 코드(BE 형식)도 포함 → FE 코드로 매핑
  const usedPowerMapped = usedPowerActionCodes.map(c => fleetCodeMap[c] ?? c);
  const usedCodes = new Set([...usedPowerMapped, ...usedInPending, ...usedFleetInPending]);
  const hasPendingAction = turnState.pendingActions.length > 0;

  const currentPlayerState = turnState.previewPlayerState ?? null;

  const handleActionClick = (fleetCode: string, config: ActionConfig) => {
    if (!isMyTurn || hasPendingAction || inFleetShipMode || usedCodes.has(config.code)) return;
    if (!myPlayerId || !(fleetProbes[fleetCode] || []).includes(myPlayerId)) return;
    // 타클론: 브레인스톤이 가이아(0)에 있고 파워 비용이 있는 액션만 차단
    if (currentPlayerState && (currentPlayerState as any).factionCode === 'TAKLONS'
        && (currentPlayerState as any).brainstoneBowl === 0 && config.cost.power) return;
    if (currentPlayerState && !ResourceCalculator.canAfford(currentPlayerState as any, config.cost)) {
      // 네블라 PI: 파워 2배
      const isNevPi = config.cost.power && (currentPlayerState as any).factionCode === 'NEVLAS'
          && (currentPlayerState as any).stockPlanetaryInstitute === 0
          && (currentPlayerState.powerBowl3 ?? 0) * 2 >= config.cost.power;
      // 타클론: 브레인스톤 bowl3이면 파워 +3으로 재판정
      const isTakBrain = config.cost.power && (currentPlayerState as any).factionCode === 'TAKLONS'
          && (currentPlayerState as any).brainstoneBowl === 3
          && ((currentPlayerState.powerBowl3 ?? 0) + 3) >= config.cost.power;
      if (!isNevPi && !isTakBrain) return;
    }

    const meta = FLEET_ACTION_FSA_META[config.code];
    if (!meta) return;

    // 타클론: 파워 비용이 있고 브레인스톤이 bowl3에 있으면 사용 여부 확인
    let useBrainstone = false;
    if (config.cost.power && currentPlayerState
        && (currentPlayerState as any).factionCode === 'TAKLONS'
        && (currentPlayerState as any).brainstoneBowl === 3) {
      const bowl3 = currentPlayerState.powerBowl3 ?? 0;
      if (bowl3 < config.cost.power) {
        // bowl3만으로 부족 → 브레인스톤 필수
        useBrainstone = true;
      } else {
        // bowl3만으로도 가능 → 사용 여부 확인
        useBrainstone = confirm('브레인스톤을 사용하시겠습니까?');
      }
    }

    if (meta.needsFederationToken) {
      // 연방 토큰 선택 모드 진입 (SeatSelector에서 토큰 클릭 시 pending 추가)
      setFleetShipMode({
        actionCode: meta.fshCode,
        fleetName: meta.fleetName,
        cost: config.cost,
        needsFederationToken: true,
      });
      return;
    }

    if (meta.needsTrack) {
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: { fleetName: meta.fleetName, actionCode: meta.fshCode, cost: config.cost, isImmediate: true, useBrainstone },
      };
      addPendingAction(action);
      return;
    }

    if (meta.needsArtifact) {
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: {
          fleetName: meta.fleetName,
          actionCode: meta.fshCode,
          cost: config.cost,
          isImmediate: true,
          useBrainstone,
        },
      };
      addPendingAction(action);
      return;
    }

    if (meta.needsTile) {
      // trackCode 없이 pending 추가 → TechTracks/함대 보드에서 타일 선택
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: {
          fleetName: meta.fleetName,
          actionCode: meta.fshCode,
          cost: config.cost,
          isImmediate: true,
        },
      };
      addPendingAction(action);
      return;
    }

    if (meta.needsGaiaformHex || meta.needsAsteroidHex || meta.needsUpgradeMineToTs || meta.needsTsToRl) {
      // pending action 먼저 추가 → 자원 감소 프리뷰 즉시 표시
      const hexAction: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: { fleetName: meta.fleetName, actionCode: meta.fshCode, cost: config.cost, isImmediate: true, useBrainstone },
      };
      addPendingAction(hexAction);
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
    // VP 액션: 동적으로 gain 계산
    let resolvedGain: Record<string, number> = { ...config.gain };
    if (meta.fshCode === 'TF_MARS_VP') {
      const storeState = useGameStore.getState();
      const td = storeState.techTileData;
      const pid = myPlayerId ?? '';
      const basicCount = td?.basicTiles.filter(t => (t.ownerPlayerIds ?? []).includes(pid)).length ?? 0;
      resolvedGain = { vp: basicCount + 2 };
    } else if (meta.fshCode === 'ECLIPSE_VP') {
      const storeState = useGameStore.getState();
      const myBuildings = storeState.buildings.filter(b => b.playerId === myPlayerId
        && b.buildingType !== 'GAIAFORMER' && b.buildingType !== 'SPACE_STATION' && !b.isLantidsMine);
      const planetTypes = new Set<string>();
      for (const b of myBuildings) {
        const hex = storeState.hexes.find(h => h.hexQ === b.hexQ && h.hexR === b.hexR);
        if (hex && hex.planetType !== 'EMPTY' && hex.planetType !== 'TRANSDIM') {
          planetTypes.add(hex.planetType);
        }
      }
      resolvedGain = { vp: planetTypes.size + 2 };
    }
    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: {
        fleetName: meta.fleetName,
        actionCode: meta.fshCode,
        cost: config.cost,
        gain: resolvedGain,
        isImmediate: meta.isImmediate,
        terraformDiscount: meta.terraformDiscount,
        navBonus: meta.navBonus,
        useBrainstone,
      },
    };
    addPendingAction(action);
  };


  // 우주선 연방 토큰 클릭 → pendingAction에 추가 (확정 버튼으로 처리)
  const handleSelectFedTile = (tileCode: string) => {
    if (!federationMode || !myPlayerId) return;
    const { pendingActions } = useGameStore.getState().turnState;
    if (pendingActions.some(a => a.type === 'FORM_FEDERATION')) return;
    addPendingAction({
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'FORM_FEDERATION',
      timestamp: Date.now(),
      payload: {
        tileCode,
        placedTokens: federationMode.placedTokens,
        selectedBuildings: federationMode.selectedBuildings,
      },
    });
    // 3삽 광산 / 무한거리 광산: 광산 배치 phase로 전환 (프리뷰 유지)
    if (tileCode === 'FED_EXP_TILE_5' || tileCode === 'FED_EXP_TILE_7') {
      useGameStore.setState((s) => ({
        federationMode: s.federationMode ? { ...s.federationMode, phase: 'PLACE_SPECIAL_MINE' as const, specialTileCode: tileCode } : null,
      }));
    } else {
      // 기술 타일 획득 등 일반 타일: federationMode 해제 → pendingAnalyzer 메시지 표시
      useGameStore.getState().setFederationMode(null);
    }
  };

  // 함대 기술 타일 클릭 핸들러 → TechTracks의 트랙 클릭으로 트랙 지정
  const handleFleetTechTileClick = (tileCode: string) => {
    if (!isTechPickActive) return;
    // tileCode만 설정, trackCode는 null → TechTracks에서 트랙 클릭 대기
    setTentativeTechTile(tileCode, null);
  };

  return (
    <div className="game-panel !p-1.5">
      <div className="flex flex-col gap-1">
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
            isTechTileClickable={isTechPickActive && hasEntered && !!ship.techTile && !(ship.techTile.ownerPlayerIds ?? []).includes(myPlayerId ?? '')}
            onTechTileClick={() => ship.techTile && handleFleetTechTileClick(ship.techTile.tileCode)}
            isFedTokenClickable={federationMode?.phase === 'SELECT_TILE' && hasEntered && !!ship.federationToken}
            onFedTokenClick={() => ship.federationToken && handleSelectFedTile(ship.federationToken)}
            artifactClickable={
              ship.fleetCode === 'TWILIGHT' && hasEntered && isMyTurn && !hasPendingAction && !inFleetShipMode
              && !!currentPlayerState && (currentPlayerState.powerBowl1 + currentPlayerState.powerBowl2 + currentPlayerState.powerBowl3) >= 6
            }
            disabledArtifacts={(() => {
              const disabled = new Set<string>();
              const fedGroups = useGameStore.getState().federationGroups;
              const hasFedToken = fedGroups.some(g => g.playerId === myPlayerId);
              if (!hasFedToken) disabled.add('ARTIFACT_13');
              return disabled;
            })()}
            onArtifactClick={(artifactCode) => {
              if (artifactCode === 'ARTIFACT_13') {
                // 연방 토큰 보상 1회 받기 → 연방 토큰 선택 모드 진입
                setFleetShipMode({
                  actionCode: 'TWILIGHT_ARTIFACT',
                  fleetName: 'TWILIGHT',
                  cost: { power: 6 },
                  needsFederationToken: true,
                  artifactCode,
                });
              } else {
                const action: FleetShipAction = {
                  id: `fsa-${Date.now()}-${Math.random()}`,
                  type: 'FLEET_SHIP_ACTION',
                  timestamp: Date.now(),
                  payload: {
                    fleetName: 'TWILIGHT',
                    actionCode: 'TWILIGHT_ARTIFACT',
                    cost: { power: 6 },
                    isImmediate: true,
                    artifactCode,
                  },
                };
                addPendingAction(action);
                setTentativeTechTile(artifactCode, null);
              }
            }}
          />
          );
        })}
      </div>



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
  isTechTileClickable?: boolean;
  onTechTileClick?: () => void;
  isFedTokenClickable?: boolean;
  onFedTokenClick?: () => void;
  onArtifactClick?: (artifactCode: string) => void;
  artifactClickable?: boolean;
  disabledArtifacts?: Set<string>;
}

function SpaceshipCard({ ship, hasEntered, canAct, usedCodes, currentPlayerState, onActionClick, isTechTileClickable, onTechTileClick, isFedTokenClickable, onFedTokenClick, onArtifactClick, artifactClickable, disabledArtifacts }: SpaceshipCardProps) {
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
        <FederationTokenSlot tokenCode={ship.federationToken} position={layout.federationToken}
          isClickable={isFedTokenClickable} onClick={onFedTokenClick} />
        {layout.techTile && (
          <TechTileSlot techTile={ship.techTile} position={layout.techTile}
            isClickable={isTechTileClickable} onClick={onTechTileClick} />
        )}
        {layout.artifacts && (
          <ArtifactSlots artifacts={ship.artifacts} positions={layout.artifacts}
            onArtifactClick={artifactClickable ? onArtifactClick : undefined}
            disabledArtifacts={disabledArtifacts} />
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

/** 플레이어 색상 동그라미 */
function ColorizedUfo({ color, size, opacity = 1 }: { color: string; size?: number; opacity?: number }) {
  return (
    <div
      style={{
        width: size ?? '0.8vw', height: size ?? '0.8vw',
        minWidth: 10, minHeight: 10,
        borderRadius: '50%',
        backgroundColor: color, opacity,
        border: '2px solid rgba(255,255,255,0.6)',
        boxSizing: 'border-box',
      }}
    />
  );
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
              width: '8%',
              height: '16%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {hasPlayer ? (
              <ColorizedUfo
                color={token!.color!}
                opacity={token!.isTentative ? 0.75 : 1}
              />
            ) : (
              <div className="w-3 h-3 rounded-full border border-white/10" />
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
        // 타클론: 브레인스톤이 bowl3에 있으면 +3 파워로 간주
        let affordable = !currentPlayerState || ResourceCalculator.canAfford(currentPlayerState, config.cost);
        // TF_MARS_GAIAFORM: 가이아포머 재고 필요
        if (config.code === 'FLEET_TF_MARS_2' && currentPlayerState && (currentPlayerState.stockGaiaformer ?? 0) <= 0) {
          affordable = false;
        }
        // 네블라 PI: 3구역 파워 2배 (파워만 재체크, 다른 자원은 여전히 확인)
        if (!affordable && currentPlayerState && config.cost.power
            && (currentPlayerState as any).factionCode === 'NEVLAS'
            && (currentPlayerState as any).stockPlanetaryInstitute === 0) {
          const pw = (currentPlayerState.powerBowl3 ?? 0) * 2 >= config.cost.power;
          const cr = currentPlayerState.credit >= (config.cost.credit || 0);
          const or = currentPlayerState.ore >= (config.cost.ore || 0);
          const kn = currentPlayerState.knowledge >= (config.cost.knowledge || 0);
          const qc = currentPlayerState.qic >= (config.cost.qic || 0);
          affordable = pw && cr && or && kn && qc;
        }
        // 타클론: 브레인스톤 bowl3 +3
        if (!affordable && currentPlayerState && config.cost.power
            && (currentPlayerState as any).factionCode === 'TAKLONS'
            && (currentPlayerState as any).brainstoneBowl === 3) {
          const effectivePower = (currentPlayerState.powerBowl3 ?? 0) + 3;
          affordable = effectivePower >= config.cost.power;
        }
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
            {isUsed && (
              <div className="w-full h-full flex items-center justify-center">
                <img src={closeImg} className="w-12 h-12 object-contain" draggable={false} />
              </div>
            )}
            {!hasEntered && !isUsed && (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-500 font-bold text-sm">🔒</span>
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
  isClickable?: boolean;
  onClick?: () => void;
}

function TechTileSlot({ techTile, position, isClickable, onClick }: TechTileSlotProps) {
  const imgSrc = techTile ? TECH_TILE_IMAGE_MAP[techTile.tileCode] : null;

  return (
    <div
      className={`absolute flex items-center justify-center ${isClickable ? 'cursor-pointer ring-2 ring-green-400 hover:brightness-125 z-10' : ''}`}
      onClick={isClickable ? onClick : undefined}
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
        width: '15%',
        height: '65%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {techTile ? (
        <div
          className="w-full h-full rounded overflow-hidden"
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
  isClickable?: boolean;
  onClick?: () => void;
}

function FederationTokenSlot({ tokenCode, position, isClickable, onClick }: FederationTokenSlotProps) {
  const imgSrc = tokenCode ? FEDERATION_TOKEN_IMAGE_MAP[tokenCode] : null;

  return (
    <div
      className={`absolute flex items-center justify-center ${isClickable ? 'cursor-pointer ring-2 ring-orange-400 hover:brightness-125 z-10' : ''}`}
      onClick={isClickable ? onClick : undefined}
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
        width: '10.8%',
        height: '42.8%',
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
  onArtifactClick?: (artifactCode: string) => void;
  disabledArtifacts?: Set<string>;
}

function ArtifactSlots({ artifacts, positions, onArtifactClick, disabledArtifacts }: ArtifactSlotsProps) {
  return (
    <>
      {positions.map((pos, idx) => {
        const artifact = artifacts.find((a) => a.slot === idx + 1);
        const hasArtifact = artifact?.artifactCode !== null;
        const imgSrc = artifact?.artifactCode ? ARTIFACT_IMAGE_MAP[artifact.artifactCode] : undefined;
        const isDisabled = disabledArtifacts?.has(artifact?.artifactCode ?? '');
        const canClick = onArtifactClick && hasArtifact && !artifact?.isTaken && !isDisabled && artifact?.artifactCode;

        return (
          <div
            key={idx}
            className={`absolute flex items-center justify-center ${canClick ? 'cursor-pointer hover:brightness-125 z-10' : ''}`}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              width: '14%',
              height: '42%',
              transform: 'translate(-50%, -50%)',
            }}
            onClick={canClick ? () => onArtifactClick(artifact!.artifactCode!) : undefined}
          >
            {hasArtifact && !artifact?.isTaken && imgSrc ? (
              <img
                src={imgSrc}
                alt={artifact?.artifactCode || ''}
                className="w-full h-full object-contain"
                draggable={false}
                title={artifact?.artifactCode || ''}
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
