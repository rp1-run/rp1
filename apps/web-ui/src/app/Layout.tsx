import { Outlet } from "react-router-dom";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Layout() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel
          defaultSize={20}
          minSize={15}
          maxSize={40}
          className="border-r"
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80}>
          <main className="h-full">
            <ScrollArea className="h-full">
              <div className="p-6">
                <Outlet />
              </div>
            </ScrollArea>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Header() {
  return (
    <header className="flex h-12 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium">rp1</span>
        <span className="text-terminal-green animate-blink">_</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Theme toggle placeholder
        </span>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Context
          </h2>
          <div className="mt-2 text-sm text-muted-foreground">
            File tree placeholder
          </div>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Work
          </h2>
          <div className="mt-2 text-sm text-muted-foreground">
            File tree placeholder
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
