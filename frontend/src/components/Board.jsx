import { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";

const SELECTED = { background: "rgba(79, 163, 227, 0.55)" };

/**
 * Thin wrapper around react-chessboard v5's options-object API, so the rest
 * of the app doesn't need to know its shape.
 *
 * Pass `onMove(from, to)` to make the board playable: it is called for both
 * drag-and-drop and click-a-piece-then-click-a-square, and should return
 * true if the move was accepted. Without it the board is display-only.
 */
export default function Board({
  fen,
  orientation = "white",
  onMove,
  interactive = true,
  squareStyles = {},
  arrows = [],
}) {
  const [selected, setSelected] = useState(null);
  const playable = Boolean(onMove) && interactive;

  // A new position (or losing the move) cancels any half-made click move.
  useEffect(() => setSelected(null), [fen, playable]);

  function handleDrop({ sourceSquare, targetSquare }) {
    setSelected(null);
    if (!playable || !targetSquare || sourceSquare === targetSquare) return false;
    return Boolean(onMove(sourceSquare, targetSquare));
  }

  function handleSquareClick({ piece, square }) {
    if (!playable) return;
    if (selected && selected !== square) {
      const accepted = onMove(selected, square);
      // Clicking another of your pieces after a rejected move re-selects it.
      setSelected(!accepted && piece ? square : null);
    } else {
      setSelected(selected === square || !piece ? null : square);
    }
  }

  const styles = selected ? { ...squareStyles, [selected]: SELECTED } : squareStyles;

  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          squareStyles: styles,
          arrows,
          allowDragging: playable,
          allowDrawingArrows: false,
          showAnimations: true,
          animationDurationInMs: 180,
        }}
      />
    </div>
  );
}
