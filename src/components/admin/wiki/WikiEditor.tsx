import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

const INK = "hsl(36 5% 16%)";
const CREAM = "hsl(40 20% 97%)";
const TAUPE = "hsl(40 10% 70%)";
const BORDER = "hsl(40 20% 97% / 0.10)";
const ACCENT = "hsl(28 30% 45%)";

const btn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  color: CREAM,
  padding: "6px 10px",
  fontSize: 11,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnActive: React.CSSProperties = { ...btn, background: ACCENT, borderColor: ACCENT };

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export default function WikiEditor({ value, onChange, placeholder, readOnly, minHeight = 400 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Image,
      Placeholder.configure({ placeholder: placeholder || "Start writing…" }),
    ],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "wiki-prose",
        style: `min-height:${minHeight}px;outline:none;color:${CREAM};font-size:15px;line-height:1.75;`,
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const a = (on: boolean) => (on ? btnActive : btn);

  return (
    <div style={{ border: `1px solid ${BORDER}`, background: INK }}>
      {!readOnly && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, borderBottom: `1px solid ${BORDER}` }}>
          <button type="button" style={a(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" style={a(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
          <button type="button" style={a(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
          <button type="button" style={a(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button type="button" style={a(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
          <button type="button" style={a(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
          <button type="button" style={a(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
          <button type="button" style={a(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
          <button type="button" style={a(editor.isActive("codeBlock"))} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</button>
          <button type="button" style={a(editor.isActive("link"))} onClick={setLink}>Link</button>
          <button type="button" style={btn} onClick={addImage}>Image</button>
          <button type="button" style={btn} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</button>
          <button type="button" style={btn} onClick={() => editor.chain().focus().undo().run()}>Undo</button>
          <button type="button" style={btn} onClick={() => editor.chain().focus().redo().run()}>Redo</button>
        </div>
      )}
      <div style={{ padding: 24 }}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .wiki-prose h1, .wiki-prose h2, .wiki-prose h3 { font-family: 'Cormorant Garamond', serif; font-weight: 300; color: ${CREAM}; margin: 1.2em 0 0.5em; line-height: 1.2; }
        .wiki-prose h1 { font-size: 32px; }
        .wiki-prose h2 { font-size: 26px; }
        .wiki-prose h3 { font-size: 20px; }
        .wiki-prose p { margin: 0 0 1em; }
        .wiki-prose ul, .wiki-prose ol { padding-left: 1.5em; margin: 0 0 1em; }
        .wiki-prose li { margin: 0.25em 0; }
        .wiki-prose a { color: ${ACCENT}; text-decoration: underline; }
        .wiki-prose blockquote { border-left: 2px solid ${ACCENT}; padding-left: 16px; margin: 1em 0; color: ${TAUPE}; font-style: italic; }
        .wiki-prose code { background: hsl(40 20% 97% / 0.08); padding: 2px 6px; font-size: 0.9em; }
        .wiki-prose pre { background: hsl(40 20% 97% / 0.05); padding: 14px; overflow-x: auto; margin: 1em 0; }
        .wiki-prose pre code { background: transparent; padding: 0; }
        .wiki-prose hr { border: 0; border-top: 1px solid ${BORDER}; margin: 2em 0; }
        .wiki-prose img { max-width: 100%; height: auto; }
        .wiki-prose table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .wiki-prose th, .wiki-prose td { border: 1px solid ${BORDER}; padding: 8px 12px; text-align: left; }
        .wiki-prose .is-editor-empty:first-child::before { color: ${TAUPE}; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; font-style: italic; }
      `}</style>
    </div>
  );
}
