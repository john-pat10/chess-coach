import { Chessboard } from "react-chessboard";

/**
 * Thin wrapper around react-chessboard v5's options-object API, so the rest
 * of the app doesn't need to know its shape.
 */
export default function Board({
  fen,
  orientation = "white",
  onPieceDrop,
  onSquareClick,
  squareStyles = {},
  arrows,
  allowDragging = false,
  allowDrawingArrows = true,
  id,
}) {
  const options = {
    position: fen,
    boardOrientation: orientation,
    squareStyles,
    allowDragging,
    allowDrawingArrows,
    showAnimations: true,
    animationDurationInMs: 180,
  };
  // Only pass optional handlers when given, so react-chessboard keeps its defaults.
  if (id) options.id = id;
  if (onPieceDrop) options.onPieceDrop = onPieceDrop;
  if (onSquareClick) options.onSquareClick = onSquareClick;
  if (arrows) options.arrows = arrows;
  return (
    <div className="board-wrap">
      <Chessboard options={options} />
    </div>
  );
}
