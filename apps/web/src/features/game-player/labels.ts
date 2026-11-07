import { getTranslations } from 'next-intl/server';

import type { GamePlayerLabels } from './game-player';

export async function playerLabels(): Promise<GamePlayerLabels> {
  const t = await getTranslations('player');
  return {
    backToGame: t('backToGame'),
    score: t('score'),
    best: t('best'),
    time: t('time'),
    pause: t('pause'),
    resume: t('resume'),
    restart: t('restart'),
    fullscreen: t('fullscreen'),
    exitFullscreen: t('exitFullscreen'),
    quit: t('quit'),
    localBestNote: t('localBestNote'),
    loadingTitle: t('states.loading.title'),
    loadingHint: t('states.loading.hint'),
    readyTitle: t('states.ready.title'),
    start: t('states.ready.start'),
    controls: t('states.ready.controls'),
    pausedTitle: t('states.paused.title'),
    pausedHint: t('states.paused.hint'),
    finishedTitle: t('states.finished.title'),
    newRecord: t('states.finished.newRecord'),
    playAgain: t('states.finished.playAgain'),
    backToCatalog: t('states.finished.backToCatalog'),
    errorTitle: t('states.error.title'),
    errorDescription: t('states.error.description'),
    retry: t('states.error.retry'),
  };
}
