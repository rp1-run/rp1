import { useState, useEffect, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";
import { ZoomIn, ZoomOut, RotateCcw, Code, AlertTriangle, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "JetBrains Mono, monospace",
});

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();
  const diagramId = `mermaid-${uniqueId.replace(/:/g, "")}`;

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "JetBrains Mono, monospace",
        });

        const { svg: renderedSvg } = await mermaid.render(diagramId, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setSvg("");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  // Handle escape key to close fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll when fullscreen is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - 0.25, 0.25));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleFullscreen = useCallback(() => {
    setIsFullscreen(true);
    // Reset zoom/pan when entering fullscreen for best initial view
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => Math.max(0.25, Math.min(5, s + delta)));
    }
  }, []);

  if (error) {
    return (
      <div className={cn("my-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4", className)}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-destructive mb-2">
              Failed to render Mermaid diagram
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {error}
            </pre>
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Show source code
              </summary>
              <pre className="mt-2 p-3 rounded bg-muted text-xs overflow-x-auto">
                {code}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  const toolbar = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomOut}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomIn}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleReset}
            aria-label="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset view</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", showSource && "bg-accent")}
            onClick={() => setShowSource(!showSource)}
            aria-label={showSource ? "Hide source" : "Show source"}
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{showSource ? "Hide source" : "Show source"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const diagramContent = (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden flex items-center justify-center",
        isFullscreen ? "h-full" : "min-h-[200px] p-4",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {svg ? (
        <div
          className="mermaid-svg transition-transform duration-100 [&_svg]:max-w-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="text-sm text-muted-foreground">Loading diagram...</div>
      )}
    </div>
  );

  const fullscreenModal = isFullscreen
    ? createPortal(
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseFullscreen();
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-muted/80 px-4 py-2">
            <span className="text-sm font-medium">Mermaid Diagram</span>
            <div className="flex items-center gap-1">
              {toolbar}
              <div className="w-px h-5 bg-border mx-1" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCloseFullscreen}
                      aria-label="Close fullscreen"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Close (Esc)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {showSource ? (
              <pre className="h-full p-6 text-sm overflow-auto">
                <code>{code}</code>
              </pre>
            ) : (
              diagramContent
            )}
          </div>

          {/* Footer */}
          {!showSource && (
            <div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground text-center">
              {Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom • Press Esc to close
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className={cn("group my-4 rounded-lg border bg-muted/30 overflow-hidden", className)}>
        <div className="flex items-center justify-between border-b bg-muted/80 px-4 py-2">
          <span className="text-xs text-muted-foreground">Mermaid Diagram</span>
          <div className="flex items-center gap-1">
            {toolbar}
            <div className="w-px h-4 bg-border mx-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleFullscreen}
                    aria-label="Fullscreen"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fullscreen</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {showSource ? (
          <pre className="p-4 text-sm overflow-x-auto">
            <code>{code}</code>
          </pre>
        ) : (
          diagramContent
        )}

        {!showSource && (
          <div className="border-t bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
            {Math.round(scale * 100)}% • Drag to pan • Ctrl+Scroll to zoom
          </div>
        )}
      </div>

      {fullscreenModal}
    </>
  );
}
