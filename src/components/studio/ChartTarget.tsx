import { useEffect, useRef } from "react";
import { ClipboardCopy, Eraser, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Panel, PanelHeader } from "../ui/panel";

interface ChartTargetProps {
  value: string;
  onChange: (value: string) => void;
  onInsert: (text: string) => void;
  lastFinal: string | null;
}

/**
 * Stands in for the note field of an EHR.
 *
 * The desktop build writes straight into the focused control with SendInput
 * and a Unicode clipboard payload; here the same `logical` string — isolates
 * and all — is inserted into an editable field, so what you see is what would
 * be pasted into Word, Daru Darman or a web form.
 */
export function ChartTarget({ value, onChange, onInsert, lastFinal }: ChartTargetProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Insertion is an explicit act — pressing the button, or the auto-insert
  // setting — so this effect only keeps the caret at the end of what is
  // already there. It must not write to `value`: doing so would re-trigger
  // itself and append the same utterance over and over.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.selectionStart = node.selectionEnd = node.value.length;
  }, [value]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be refused; the text is still selectable.
    }
  }

  return (
    <Panel className="flex min-h-0 flex-col">
      <PanelHeader
        title="Chart target"
        hint="The exact string that would be pasted into the focused field. Latin runs are fenced in Unicode isolates so Persian keeps its direction."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={copyAll} disabled={!value}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange("")} disabled={!value}>
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        <textarea
          ref={ref}
          dir="rtl"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="بخش یادداشت بیمار اینجا نمایش داده می‌شود…"
          className="bidi-surface min-h-[220px] flex-1 resize-none rounded-md border border-input bg-background/60 p-4 text-[15px] leading-9 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!lastFinal}
            onClick={() => lastFinal && onInsert(lastFinal)}
          >
            <FileText className="h-3.5 w-3.5" />
            Insert last utterance
          </Button>
          <span className="tabnum text-[11px] text-muted-foreground">{value.length} characters</span>
        </div>
      </div>
    </Panel>
  );
}
