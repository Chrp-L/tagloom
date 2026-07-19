import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";

interface Props {
  variant: "grid" | "list";
  visible: boolean;
  checked: boolean;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function SelectionButton({ variant, checked, label, onKeyDown }: Omit<Props, "visible">) {
  const isGrid = variant === "grid";
  return (
    <motion.button
      key="batch-check"
      className={isGrid ? "selectControl tactile" : "listCheck tactile"}
      style={isGrid ? { zIndex: 3 } : undefined}
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-selection-control
      aria-label={label}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={isGrid ? { opacity: 0, scale: 0.86 } : undefined}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {isGrid ? (
        <span>
          <SelectionCheckMark checked={checked} size={14} />
        </span>
      ) : (
        <SelectionCheckMark checked={checked} size={13} />
      )}
    </motion.button>
  );
}

function SelectionCheckMark({ checked, size }: { checked: boolean; size: number }) {
  return (
    <AnimatePresence initial={false}>
      {checked && (
        <motion.i
          key="checked"
          className="selectionCheckMark"
          initial={{ opacity: 0, scale: 0.55 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <Check size={size} />
        </motion.i>
      )}
    </AnimatePresence>
  );
}

export function AssetSelectionControl(props: Props) {
  if (props.variant === "list") {
    return props.visible ? <SelectionButton {...props} /> : null;
  }

  return (
    <AnimatePresence initial={false}>
      {props.visible && <SelectionButton {...props} />}
    </AnimatePresence>
  );
}
