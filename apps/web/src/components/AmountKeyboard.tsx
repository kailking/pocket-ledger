const keys = ["7", "8", "9", "⌫", "4", "5", "6", "+", "1", "2", "3", "-", "C", "0", ".", "确定"];

interface AmountKeyboardProps {
  onKey?: (key: string) => void;
}

export function AmountKeyboard({ onKey }: AmountKeyboardProps) {
  return (
    <div className="amount-keyboard">
      {keys.map((key) => (
        <button
          className={key === "确定" ? "amount-keyboard__confirm" : ""}
          key={key}
          onClick={() => onKey?.(key)}
          type="button"
        >
          {key}
        </button>
      ))}
    </div>
  );
}

