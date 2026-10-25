import { bestMove, type Difficulty, type EngineMove } from './engine';

interface Request {
  id: number;
  fen: string;
  difficulty: Difficulty;
}

// Typed by hand: the package compiles against the DOM lib, not WebWorker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: { id: number; move: EngineMove | null }): void;
};

scope.onmessage = (event) => {
  const { id, fen, difficulty } = event.data;
  scope.postMessage({ id, move: bestMove(fen, difficulty) });
};
