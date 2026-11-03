import { Chessboard } from "react-chessboard";

/**
 * Thin wrapper around react-chessboard v5's options-object API, so the rest
 * of the app doesn't need to know its shape.
 */
export default function Board({
  fen,
  orientation = "white",
  onPieceDrop,
  squareStyles = {},
  allowDragging = false,
}) {
  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          onPieceDrop,
          squareStyles,
          allowDragging,
          showAnimations: true,
          animationDurationInMs: 180,
        }}
      />
    </div>
  );
}
