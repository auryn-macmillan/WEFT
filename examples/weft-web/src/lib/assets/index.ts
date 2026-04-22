// All SVGs are hand-crafted and generated without external libraries
// These are imported using ?raw to allow inline rendering via {@html asset}

// Hospitals
import hospitalStMercy from './svg/hospital-st-mercy.svg?raw';
import hospitalEastside from './svg/hospital-eastside.svg?raw';
import hospitalPacific from './svg/hospital-pacific.svg?raw';

// Committee Avatars
import avatarCiphernode1 from './svg/avatar-ciphernode-1.svg?raw';
import avatarCiphernode2 from './svg/avatar-ciphernode-2.svg?raw';
import avatarCiphernode3 from './svg/avatar-ciphernode-3.svg?raw';
import avatarCiphernode4 from './svg/avatar-ciphernode-4.svg?raw';
import avatarCiphernode5 from './svg/avatar-ciphernode-5.svg?raw';

// Icons & Crypto Elements
import lockClosed from './svg/lock-closed.svg?raw';
import lockOpen from './svg/lock-open.svg?raw';
import lockHalf from './svg/lock-half.svg?raw';
import keyMaster from './svg/key-master.svg?raw';
import keyShard1 from './svg/key-shard-1.svg?raw';
import keyShard2 from './svg/key-shard-2.svg?raw';
import keyShard3 from './svg/key-shard-3.svg?raw';
import keyShard4 from './svg/key-shard-4.svg?raw';
import keyShard5 from './svg/key-shard-5.svg?raw';
import gradientTile from './svg/gradient-tile.svg?raw';
import ciphertextTile from './svg/ciphertext-tile.svg?raw';
import cloudModel from './svg/cloud-model.svg?raw';
import gradientArrow from './svg/gradient-arrow.svg?raw';

// Phase Heroes
import heroPhase1 from './svg/hero-phase-1.svg?raw';
import heroPhase2 from './svg/hero-phase-2.svg?raw';
import heroPhase3 from './svg/hero-phase-3.svg?raw';
import heroPhase4 from './svg/hero-phase-4.svg?raw';
import heroPhase5 from './svg/hero-phase-5.svg?raw';
import heroPhase6 from './svg/hero-phase-6.svg?raw';
import heroPhase7 from './svg/hero-phase-7.svg?raw';
import heroPhase8 from './svg/hero-phase-8.svg?raw';

export const assets = {
  hospitals: {
    stMercy: hospitalStMercy,
    eastside: hospitalEastside,
    pacific: hospitalPacific,
  },
  avatars: {
    ciphernode1: avatarCiphernode1,
    ciphernode2: avatarCiphernode2,
    ciphernode3: avatarCiphernode3,
    ciphernode4: avatarCiphernode4,
    ciphernode5: avatarCiphernode5,
  },
  icons: {
    lockClosed,
    lockOpen,
    lockHalf,
    keyMaster,
    keyShards: [keyShard1, keyShard2, keyShard3, keyShard4, keyShard5],
    gradientTile,
    ciphertextTile,
    cloudModel,
    gradientArrow,
  },
  heroes: {
    phase1: heroPhase1,
    phase2: heroPhase2,
    phase3: heroPhase3,
    phase4: heroPhase4,
    phase5: heroPhase5,
    phase6: heroPhase6,
    phase7: heroPhase7,
    phase8: heroPhase8,
  }
};
