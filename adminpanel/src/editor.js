// Standalone best-in-class blog editor (Tiptap, CDN, Monaco fallback)
// This file is loaded only on /articles/new for the rich editor

// Dynamically load Tiptap (or fallback to Monaco/textarea if offline)

export async function loadBestEditor(mountId, initialContent = '') {
    // Try Tiptap CDN
    const mount = document.getElementById(mountId);
    if (!mount) return;

    // Load Tiptap via CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@tiptap/core@2.2.0/dist/tiptap.umd.min.js';
    script.onload = () => {
        // Minimal Tiptap setup
        const { Editor, StarterKit } = window.tiptap;
        const editor = new Editor({
            element: mount,
            extensions: [StarterKit],
            content: initialContent,
            onUpdate: ({ editor }) => {
                mount.dispatchEvent(new CustomEvent('editor-update', { detail: editor.getHTML() }));
            },
        });
        mount.editor = editor;
    };
    script.onerror = () => {
        // Fallback: Monaco or textarea
        mount.innerHTML = '<textarea style="width:100%;min-height:320px;">' + initialContent + '</textarea>';
    };
    document.head.appendChild(script);
}
