import React, { useState } from 'react';
import type { ToolType, ProjectMetadata } from './types';

const INITIAL_PROJECT: ProjectMetadata = {
  id: 'default-project',
  title: 'UNTITLED_SPRITE',
  width: 32,
  height: 32,
  fps: 8,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  thumbnailUrl: null
};

export const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [project] = useState<ProjectMetadata>(INITIAL_PROJECT);
  const [scanlines, setScanlines] = useState<boolean>(true);

  return (
    <div className="relative flex flex-col h-screen w-screen bg-[#0c0c14] text-white select-none overflow-hidden pb-[env(safe-area-inset-bottom)]">
      {scanlines && <div className="absolute inset-0 crt-scanlines z-50 pointer-events-none" />}
      
      <header className="h-12 border-b-2 border-black bg-[#171822] px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-[#00ff66] text-xs sm:text-sm tracking-wider font-bold">PIXEL-ART-STUDIO</span>
          <span className="hidden sm:inline-block text-neutral-500 text-[10px]">[{project.width}x{project.height}]</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanlines(!scanlines)}
            className="px-2 py-1 text-[10px] bg-[#282a3a] hover:bg-[#383a4f] text-[#00e5ff] pixel-border-outset"
          >
            CRT: {scanlines ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-14 sm:w-16 border-r-2 border-black bg-[#171822] flex flex-col items-center py-2 gap-2 z-10">
          {(['pencil', 'eraser', 'bucket', 'eyedropper', 'line', 'pan'] as ToolType[]).map((tool) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              className={`w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center text-[10px] uppercase font-bold transition-transform ${
                activeTool === tool
                  ? 'bg-[#00ff66] text-black pixel-border-inset translate-y-0.5'
                  : 'bg-[#282a3a] text-white hover:bg-[#383a4f] pixel-border-outset'
              }`}
              title={tool}
            >
              {tool.slice(0, 3)}
            </button>
          ))}
        </aside>

        <main className="flex-1 flex flex-col items-center justify-center bg-[#07070b] relative overflow-hidden p-4">
          <div className="relative border-4 border-black bg-[#171822] pixel-border-outset flex items-center justify-center p-2">
            <div 
              className="w-64 h-64 sm:w-80 sm:h-80 bg-neutral-900 grid grid-cols-8 grid-rows-8 border border-neutral-700 shadow-inner"
              style={{
                backgroundImage: 'linear-gradient(45deg, #1b1b24 25%, transparent 25%), linear-gradient(-45deg, #1b1b24 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1b1b24 75%), linear-gradient(-45deg, transparent 75%, #1b1b24 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
              }}
            >
              <div className="w-full h-full flex items-center justify-center text-center p-4">
                <span className="text-[10px] text-[#00e5ff] leading-relaxed">
                  READY: {activeTool.toUpperCase()}
                  <br />
                  <span className="text-neutral-500 text-[8px]">CANVAS PIPELINE INITIALIZED</span>
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="h-8 border-t-2 border-black bg-[#171822] px-4 flex items-center justify-between text-[8px] text-neutral-400 z-10">
        <div>STATUS: ACTIVE</div>
        <div>SCALE: 100%</div>
        <div>LAYERS: 1</div>
      </footer>
    </div>
  );
};

export default App;
