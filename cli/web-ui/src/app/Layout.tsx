import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/FileTree";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useFileTree } from "@/hooks/useFileTree";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";

const SIDEBAR_COLLAPSED_KEY = "rp1-ui-sidebar-collapsed";
const SIDEBAR_SIZE_KEY = "rp1-ui-sidebar-size";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore
  }
}

function loadSidebarSize(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_SIZE_KEY);
    if (stored) {
      const size = parseFloat(stored);
      if (!isNaN(size) && size >= 15 && size <= 40) {
        return size;
      }
    }
  } catch {
    // ignore
  }
  return 20;
}

function saveSidebarSize(size: number): void {
  try {
    localStorage.setItem(SIDEBAR_SIZE_KEY, String(size));
  } catch {
    // ignore
  }
}

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [sidebarSize, setSidebarSize] = useState(loadSidebarSize);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const navigate = useNavigate();
  const params = useParams();
  const { tree, loading, error, refetch } = useFileTree();
  const { status: wsStatus, onTreeChange } = useWebSocket();

  const selectedPath = params["*"] || null;

  useEffect(() => {
    return onTreeChange(() => {
      refetch();
    });
  }, [onTreeChange, refetch]);

  const handleFileSelect = useCallback(
    (path: string) => {
      navigate(`/view/${path}`);
    },
    [navigate]
  );

  const toggleSidebar = useCallback(() => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    saveSidebarCollapsed(newCollapsed);

    if (sidebarRef.current) {
      if (newCollapsed) {
        sidebarRef.current.collapse();
      } else {
        sidebarRef.current.expand();
      }
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const handleSidebarResize = useCallback((size: number) => {
    if (size > 0) {
      setSidebarSize(size);
      saveSidebarSize(size);
    }
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} wsStatus={wsStatus} />
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
        onLayout={(sizes) => {
          if (sizes[0] !== undefined && sizes[0] > 0) {
            handleSidebarResize(sizes[0]);
          }
        }}
      >
        <ResizablePanel
          ref={sidebarRef}
          defaultSize={sidebarCollapsed ? 0 : sidebarSize}
          minSize={0}
          maxSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            setSidebarCollapsed(true);
            saveSidebarCollapsed(true);
          }}
          onExpand={() => {
            setSidebarCollapsed(false);
            saveSidebarCollapsed(false);
          }}
          className="border-r"
        >
          <div className="h-full">
            <FileTree
              tree={tree}
              loading={loading}
              error={error}
              selectedPath={selectedPath}
              onSelect={handleFileSelect}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={sidebarCollapsed ? 100 : 100 - sidebarSize}>
          <main id="main-content" className="h-full" tabIndex={-1}>
            <ScrollArea className="h-full">
              <div className="p-6">
                <Outlet context={{ refetchTree: refetch }} />
              </div>
            </ScrollArea>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  wsStatus: "connecting" | "connected" | "disconnected";
}

function Header({ onToggleSidebar, sidebarCollapsed, wsStatus }: HeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8"
          title={sidebarCollapsed ? "Show sidebar (⌘B)" : "Hide sidebar (⌘B)"}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        <span
          title={wsStatus === "connected" ? "Live updates active" : "Reconnecting..."}
          aria-label={`Connection status: ${wsStatus}`}
        ><span className="text-terminal-mauve">&gt; </span><span className="text-lg font-medium">rp1</span><span
            className={`animate-blink ${wsStatus === "connected" ? "text-terminal-green" : "text-terminal-red"}`}
          >_</span></span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
