import { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLANET_COLORS } from '../constants/colors';
import mineImg from '../assets/building/Mine.png';
import tradingStationImg from '../assets/building/TradingStation.png';
import researchLabImg from '../assets/building/Research.png';
import academyImg from '../assets/building/Academy.png';
import piImg from '../assets/building/PlanetaryInstitute.png';
import pomerImg from '../assets/resource/Pomer.png';
import hiveImg from '../assets/resource/Hive.png';
import knowledgeImg from '../assets/resource/Knowledge.png';
import terraformingImg from '../assets/resource/Terraforming.png';
import distanceImg from '../assets/resource/Distance.png';
import qicImg from '../assets/resource/QIC.png';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { BOOSTER_IMAGE_MAP } from '../constants/boosterImage';
import { ROUND_SCORING_IMAGE_MAP } from '../constants/roundScoringImage';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage';
import { ARTIFACT_IMAGE_MAP } from '../constants/artifactImage';

// 파워 액션 이미지
import pwrK3Img from '../assets/action/K_3.png';
import pwrTera2Img from '../assets/action/Tera_2.png';
import pwrO2Img from '../assets/action/O_2.png';
import pwrC7Img from '../assets/action/C_7.png';
import pwrK2Img from '../assets/action/k_2.png';
import pwrTera1Img from '../assets/action/Tera_1.png';
import pwrTokenImg from '../assets/action/Token_2.png';

// 함대 액션 이미지
import tfTileVpImg from '../assets/action/T.F_Tile_Vp.png';
import tfPomingImg from '../assets/action/T.F_Poming.png';
import tfTera1Img from '../assets/action/T.F_Tera1.png';
import ecPlanetVpImg from '../assets/action/E.C_Planet_Vp.png';
import ecKImg from '../assets/action/E.C_K.png';
import ecAsteroidsImg from '../assets/action/E.C_Asteroids.png';
import rvTileImg from '../assets/action/R.V_Tile.png';
import rvUpImg from '../assets/action/R.V_Up.png';
import rv2kImg from '../assets/action/R.V_2k.png';
import twFedImg from '../assets/action/T.W_Fed.png';
import twUpImg from '../assets/action/T.W_Up.png';
import twDis3Img from '../assets/action/T.W_Dis_3.png';

// 함대 토큰 이미지
import tfTokenImg from '../assets/resource/T.F_Token.png';
import ecTokenImg from '../assets/resource/E.C_token.png';
import rvTokenImg from '../assets/resource/R.V_Token.png';
import twTokenImg from '../assets/resource/T.W_Token.png';

const FACTION_PLANET: Record<string, string> = {
  TERRANS: 'TERRA', LANTIDS: 'TERRA', HADSCH_HALLAS: 'VOLCANIC', IVITS: 'VOLCANIC',
  TAKLONS: 'SWAMP', AMBAS: 'SWAMP', GEODENS: 'OXIDE', BAL_TAKS: 'OXIDE',
  GLEENS: 'DESERT', XENOS: 'DESERT', FIRAKS: 'TITANIUM', BESCODS: 'TITANIUM',
  ITARS: 'ICE', NEVLAS: 'ICE', MOWEIDS: 'LOST_PLANET', SPACE_GIANTS: 'LOST_PLANET',
  TINKEROIDS: 'ASTEROIDS', DAKANIANS: 'ASTEROIDS',
};

const BUILDING_IMG: Record<string, string> = {
  MINE: mineImg, TRADING_STATION: tradingStationImg, RESEARCH_LAB: researchLabImg,
  ACADEMY: academyImg, PLANETARY_INSTITUTE: piImg,
};

const POWER_ACTION_IMG: Record<string, string> = {
  PWR_KNOWLEDGE:   pwrK3Img,
  PWR_TERRAFORM_2: pwrTera2Img,
  PWR_ORE:         pwrO2Img,
  PWR_CREDIT:      pwrC7Img,
  PWR_KNOWLEDGE_2: pwrK2Img,
  PWR_TERRAFORM:   pwrTera1Img,
  PWR_TOKEN:       pwrTokenImg,
};

const FLEET_TOKEN_IMG: Record<string, string> = {
  TF_MARS:   tfTokenImg,
  ECLIPSE:   ecTokenImg,
  REBELLION: rvTokenImg,
  TWILIGHT:  twTokenImg,
};

const FLEET_SHIP_ACTION_IMG: Record<string, string> = {
  TF_MARS_VP:        tfTileVpImg,
  TF_MARS_GAIAFORM:  tfPomingImg,
  TF_MARS_TERRAFORM: tfTera1Img,
  ECLIPSE_VP:        ecPlanetVpImg,
  ECLIPSE_TECH:      ecKImg,
  ECLIPSE_MINE:      ecAsteroidsImg,
  REBELLION_TECH:    rvTileImg,
  REBELLION_UPGRADE: rvUpImg,
  REBELLION_CONVERT: rv2kImg,
  TWILIGHT_FED:      twFedImg,
  TWILIGHT_UPGRADE:  twUpImg,
  TWILIGHT_NAV:      twDis3Img,
};

// 함대 함선 액션 → 추가 건물 이미지
const FLEET_SHIP_BUILDING_IMG: Record<string, string> = {
  ECLIPSE_MINE:      mineImg,
  REBELLION_UPGRADE: tradingStationImg,
  TWILIGHT_UPGRADE:  researchLabImg,
};

const imgStyle = { width: '3.28cqw', height: '3.28cqw', display: 'inline-block', verticalAlign: 'middle' };

/** 건물 이미지에 플레이어 색상 tint 적용 */
function BuildingIcon({ src, alt, color }: { src: string; alt: string; color: string }) {
  return (
    <span style={{ ...imgStyle, position: 'relative', display: 'inline-block' }}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', display: 'block' }} />
      <span style={{ position: 'absolute', inset: 0, backgroundColor: color, opacity: 0.55, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
    </span>
  );
}

function LogContent({ entry }: { entry: any }) {
  const d = entry.actionData || {};
  const playerColor = PLANET_COLORS[FACTION_PLANET[entry.factionCode] ?? 'TERRA'] ?? '#888';
  switch (entry.actionType) {
    case 'PLACE_MINE':
      return <BuildingIcon src={mineImg} alt="광산" color={playerColor} />;
    case 'UPGRADE_BUILDING': {
      const fromImg = BUILDING_IMG[d.from] ?? mineImg;
      const toImg = BUILDING_IMG[d.to] ?? tradingStationImg;
      return <><BuildingIcon src={fromImg} alt={d.from} color={playerColor} /><span style={{ margin: '0 0.26cqw', color: '#9ca3af' }}>→</span><BuildingIcon src={toImg} alt={d.to} color={playerColor} /></>;
    }
    case 'POWER_ACTION': {
      const pwrImg = POWER_ACTION_IMG[d.powerActionCode];
      return pwrImg
        ? <img src={pwrImg} style={imgStyle} alt={d.powerActionCode} />
        : <span className="text-purple-300">⚡{d.powerActionCode?.replace('PWR_', '') ?? ''}</span>;
    }
    case 'FLEET_ACTION': {
      const fleetImg = FLEET_TOKEN_IMG[d.fleetName];
      return fleetImg
        ? <img src={fleetImg} style={imgStyle} alt={d.fleetName} />
        : <span className="text-cyan-300">{d.fleetName}</span>;
    }
    case 'FLEET_SHIP_ACTION': {
      // 인공물 획득: 인공물 이미지 표시
      if (d.actionCode === 'TWILIGHT_ARTIFACT' && d.artifactCode) {
        const artImg = ARTIFACT_IMAGE_MAP[d.artifactCode as string];
        return artImg
          ? <img src={artImg} style={imgStyle} alt={d.artifactCode} />
          : <span className="text-cyan-300">{d.artifactCode}</span>;
      }
      const actionImg = FLEET_SHIP_ACTION_IMG[d.actionCode];
      const buildingImg = FLEET_SHIP_BUILDING_IMG[d.actionCode];
      const tileImg = d.actionCode === 'REBELLION_TECH' && d.tileCode ? TECH_TILE_IMAGE_MAP[d.tileCode] : null;
      return <>
        {actionImg && <img src={actionImg} style={imgStyle} alt={d.actionCode} />}
        {buildingImg && <span style={{ marginLeft: '0.2cqw' }}><BuildingIcon src={buildingImg} alt="building" color={playerColor} /></span>}
        {tileImg && <img src={tileImg} style={{ ...imgStyle, marginLeft: '0.2cqw' }} alt={d.tileCode} />}
        {!actionImg && <span className="text-cyan-300">함대액션</span>}
      </>;
    }
    case 'ADVANCE_TECH': {
      const trackIcon: Record<string, string> = { TERRA_FORMING: terraformingImg, NAVIGATION: distanceImg, AI: qicImg };
      const icon = trackIcon[d.trackCode];
      const level = d.newLevel != null ? d.newLevel : '';
      if (icon) {
        return <><img src={icon} style={imgStyle} alt="" /><span style={{ color: '#d1d5db' }}> 트랙{level}</span></>;
      }
      const textLabel: Record<string, string> = { GAIA_FORMING: '가이아', ECONOMY: '경제', SCIENCE: '지식' };
      return <span style={{ color: '#d1d5db' }}>{textLabel[d.trackCode] ?? d.trackCode} 트랙{level}</span>;
    }
    case 'DEPLOY_GAIAFORMER':
      return <img src={pomerImg} style={imgStyle} alt="포머" />;
    case 'PASS': {
      const prevBooster = d.previousBooster ? BOOSTER_IMAGE_MAP[d.previousBooster] : null;
      const nextBooster = d.nextBooster ? BOOSTER_IMAGE_MAP[d.nextBooster] : null;
      return <>
        {prevBooster ? <img src={prevBooster} style={imgStyle} alt="이전" /> : null}
        <span style={{ margin: '0 0.26cqw', color: '#9ca3af' }}>→</span>
        {nextBooster ? <img src={nextBooster} style={imgStyle} alt="다음" /> : <span className="text-red-400">Pass</span>}
      </>;
    }
    case 'FACTION_ABILITY': {
      const abilityLabel: Record<string, string> = {
        FIRAKS_DOWNGRADE: '연구소↓교역소+트랙↑',
        AMBAS_SWAP: '광산↔의회 교환',
        IVITS_PLACE_STATION: null,
        MOWEIDS_RING: '건물 링 씌우기',
        BESCODS_ADVANCE_LOWEST_TRACK: '최저 트랙↑',
        GLEENS_JUMP: '거리+2 점프',
        GLEENS_FEDERATION_TOKEN: '연방토큰 (2c+1o+1k)',
        SPACE_GIANTS_TERRAFORM_2: '테라포밍 2단계',
        ITARS_GAIA_TO_TECH_TILE: '4가이아→기술타일',
        TINKEROIDS_USE_ACTION: '팅커로이드 능력',
        QIC_ACADEMY_ACTION: 'QIC 아카데미',
      };
      if (d.abilityCode === 'IVITS_PLACE_STATION') {
        return <BuildingIcon src={hiveImg} alt="우주정거장" color={playerColor} />;
      }
      return <span className="text-yellow-300">{abilityLabel[d.abilityCode] ?? d.abilityCode ?? '능력'}</span>;
    }
    case 'FORM_FEDERATION': {
      const fedImg = d.tileCode ? FEDERATION_TOKEN_IMAGE_MAP[d.tileCode] : null;
      return fedImg ? <img src={fedImg} style={imgStyle} alt="연방" /> : <span className="text-orange-300">연방</span>;
    }
    case 'BOOSTER_ACTION': {
      const bImg = d.boosterCode ? BOOSTER_IMAGE_MAP[d.boosterCode] : null;
      return bImg ? <img src={bImg} style={imgStyle} alt="부스터" /> : <span className="text-green-300">부스터</span>;
    }
    case 'TECH_TILE_ACTION': {
      const tileImg = d.tileCode ? TECH_TILE_IMAGE_MAP[d.tileCode] : null;
      return tileImg ? <img src={tileImg} style={imgStyle} alt={d.tileCode} /> : <span className="text-amber-300">타일액션</span>;
    }
    case 'QIC_ACADEMY_ACTION':
      return <img src={academyImg} style={imgStyle} alt="아카데미" />;
    case 'ROUND_STARTED':
      return <span className="text-emerald-400 font-bold">── R{entry.roundNumber} ──</span>;
    default:
      return <span className="text-gray-400">{entry.actionType}</span>;
  }
}

function getTooltip(entry: any): string {
  const d = entry.actionData || {};
  switch (entry.actionType) {
    case 'PLACE_MINE': return `광산 건설 (${d.hexQ ?? '?'},${d.hexR ?? '?'})`;
    case 'UPGRADE_BUILDING': return `${d.from}→${d.to} (${d.hexQ},${d.hexR})`;
    case 'POWER_ACTION': return d.powerActionCode ?? '';
    case 'FLEET_ACTION': return `함대 입장: ${d.fleetName}`;
    case 'FLEET_SHIP_ACTION': return d.actionCode ?? '';
    case 'ADVANCE_TECH': return `트랙: ${d.trackCode ?? ''}`;
    case 'DEPLOY_GAIAFORMER': return `포머 (${d.hexQ},${d.hexR})`;
    case 'PASS': return `부스터: ${d.nextBooster ?? ''}`;
    case 'FACTION_ABILITY': return d.abilityCode ?? '';
    case 'FORM_FEDERATION': return d.tileCode ?? '';
    case 'BOOSTER_ACTION': return d.actionType ?? '';
    case 'TECH_TILE_ACTION': return d.tileCode ?? '';
    default: return '';
  }
}

function hasHexCoord(entry: any): boolean {
  const d = entry.actionData || {};
  return d.hexQ != null && d.hexR != null;
}

export default function ActionLogPanel() {
  const logs = useGameStore(s => s.actionLogs);
  const setHighlightHex = useGameStore(s => s.setHighlightHex);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="absolute z-10" style={{ bottom: '2.5cqw', left: '0.65cqw', backgroundColor: 'rgba(31,41,55,0.9)', padding: '0.46cqw', borderRadius: '0.39cqw', width: '13.9cqw', maxHeight: '20.3cqw' }}>
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '19cqw' }}>
        {[...logs].reverse().map((log, idx) => {
          const color = PLANET_COLORS[FACTION_PLANET[log.factionCode] ?? 'TERRA'] ?? '#888';
          const tooltip = getTooltip(log);
          const hoverable = hasHexCoord(log);
          return (
            <div
              key={log.actionId ?? idx}
              className="flex items-center"
              style={{ gap: '0.47cqw', padding: '0.16cqw 0', fontSize: '1.375cqw', cursor: hoverable ? 'pointer' : 'default' }}
              title={tooltip}
              onMouseEnter={() => hoverable && setHighlightHex({ q: log.actionData.hexQ, r: log.actionData.hexR })}
              onMouseLeave={() => hoverable && setHighlightHex(null)}
            >
              <div className="rounded-full flex-shrink-0" style={{ width: '2.1cqw', height: '2.1cqw', backgroundColor: color, border: '1px solid rgba(255,255,255,0.4)' }} />
              <LogContent entry={log} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
