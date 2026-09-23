import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PixelLayer, ProjectMetadata, SymmetryMode, ToolType } from '../types';
import { editorStore, useEditorStore } from '../store/editorStore';
import { projectStore, useProjectStore } from '../store/projectStore';
import { usePixelProjectStorage } from '../hooks/usePixelProjectStorage';
import { useHistoryBuffer } from '../hooks/useHistoryBuffer';
import { useSelectionBounds } from '../hooks/useSelectionBounds';
import { TOOL_DEFINITIONS, TOOL_ID_BY_HOTKEY } from '../utils/tools/toolDefinitions';
import { PRESET_PALETTES, parseHexList, resolvePaletteById } from '../utils/color/presetPalettes';
import { retroAudioEngine } from '../utils/audio/soundSynth';
import { CanvasViewport } from '../components/domain/CanvasViewport';
import { AudioController } from '../components/domain/AudioController';
import { ExportDialog } from '../components/domain/ExportDialog';
import { NewProjectDialog } from '../components/domain/NewProjectDialog';
import { ProjectLibraryModal } from '../components/domain/ProjectLibraryModal';
import { ColorPickerPanel } from '../components/compound/ColorPickerPanel';
import { HistoryControls } from '../components/compound/HistoryControls';
import { LayerList } from '../components/compound/LayerList';
import { PaletteManager } from '../components/compound/PaletteManager';
import { SymmetryControls } from '../components/compound/SymmetryControls';
import { ToolsetPanel } from '../components/compound/ToolsetPanel';
import { ZoomControls } from '../components/compound/ZoomControls';
import { MainWorkbench } from '../components/layout/MainWorkbench';
import { MobileControlDrawer } from '../components/layout/MobileControlDrawer';
import type { MobileDrawerTab } from '../components/layout/MobileControlDrawer';
import { MobileToolCarousel } from '../components/layout/MobileToolCarousel';
import { RetroHeader } from '../components/layout/RetroHeader';
import { RetroCard } from '../components/primitives/RetroCard';

/** True when the keyboard event originated in a text field. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();

  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

/**
 * Studio page — the assembly point of the application.
 *
 * Binds stores and hooks to the layout components, owns dialog/drawer
 * visibility, and installs the global shortcut table. The shell is one
 * responsive tree rather than a JS breakpoint switch: the mobile dock renders
 * below 768px and the rail + panel workbench at and above it, with `hidden`
 * (display:none) removing the inactive branch from both layout and the
 * accessibility tree.
 */
export function StudioPage() {
  /* ---------------- store slices ---------------- */

  const project = useEditorStore((state) => state.currentProject);
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const selectedTool = useEditorStore((state) => state.selectedTool);
  const primaryColor = useEditorStore((state) => state.primaryColor);
  const secondaryColor = useEditorStore((state) => state.secondaryColor);
  const brushSize = useEditorStore((state) => state.brushSize);
  const symmetryMode = useEditorStore((state) => state.symmetryMode);
  const symmetryGuidesVisible = useEditorStore((state) => state.symmetryGuidesVisible);
  const viewport = useEditorStore((state) => state.viewport);
  const settings = useEditorStore((state) => state.settings);
  const activePaletteId = useEditorStore((state) => state.activePaletteId);
  const customPalettes = useEditorStore((state) => state.customPalettes);

  const persistenceStatus = useProjectStore((state) => state.status);
  const persistenceError = useProjectStore((state) => state.lastError);

  /* ---------------- hooks ---------------- */

  const storage = usePixelProjectStorage();
  const history = useHistoryBuffer();
  const dimensions = useMemo(
    () => ({ width: project.width, height: project.height }),
    [project.width, project.height],
  );
  const selectionBounds = useSelectionBounds(dimensions);

  /* ---------------- local UI state ---------------- */

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<MobileDrawerTab>('tools');
  const [panelOpen, setPanelOpen] = useState(true);

  const isModalOpen = newProjectOpen || exportOpen || libraryOpen || drawerOpen;

  const activePalette = useMemo(
    () => resolvePaletteById(activePaletteId, customPalettes),
    [activePaletteId, customPalettes],
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${project.title} — Pixel Art Studio`;
    }
  }, [project.title]);

  /* ---------------- handlers ---------------- */

  const selectTool = useCallback((tool: ToolType): void => {
    editorStore.setTool(tool);
    retroAudioEngine.playToolSelect();
  }, []);

  const toggleEyedropper = useCallback((): void => {
    editorStore.setTool(
      editorStore.getState().selectedTool === 'eyedropper' ? 'pencil' : 'eyedropper',
    );
    retroAudioEngine.playToolSelect();
  }, []);

  const createCustomPalette = useCallback((name: string, hexColors: readonly string[]): void => {
    // Re-parse through the shared hex-list reader so invalid and duplicate entries
    // are dropped with one rule set instead of a bespoke filter per call site.
    editorStore.createCustomPaletteFromHexList(name, parseHexList(hexColors.join(' ')));
  }, []);

  const openDrawer = useCallback((tab: MobileDrawerTab): void => {
    retroAudioEngine.playToolSelect();
    setDrawerTab(tab);
    setDrawerOpen(true);
  }, []);

  const openLibrary = useCallback((): void => {
    void storage.refreshLibrary();
    setLibraryOpen(true);
  }, [storage]);

  const handleCreateProject = useCallback((options: Parameters<typeof editorStore.createNewProject>[0]): void => {
    editorStore.createNewProject(options);
    editorStore.clearHistory();
    setNewProjectOpen(false);
    retroAudioEngine.playActionSuccess();
  }, []);

  const handleAddLayer = useCallback((): void => {
    if (editorStore.addLayer() === null) {
      retroAudioEngine.playErrorBuzz();
      return;
    }

    retroAudioEngine.playActionSuccess();
  }, []);

  const handleDeleteLayer = useCallback((layerId: string): void => {
    if (!editorStore.deleteLayer(layerId)) {
      retroAudioEngine.playErrorBuzz();
      return;
    }

    retroAudioEngine.playToolSelect();
  }, []);

  const handleMergeLayer = useCallback((layerId: string): void => {
    if (!editorStore.mergeLayerDown(layerId)) {
      retroAudioEngine.playErrorBuzz();
      return;
    }

    retroAudioEngine.playActionSuccess();
  }, []);

  const handleDuplicateLayer = useCallback((layerId: string): void => {
    if (editorStore.duplicateLayer(layerId) !== null) {
      retroAudioEngine.playActionSuccess();
    }
  }, []);

  const handleImportProject = useCallback(
    (payload: { project: ProjectMetadata; layers: PixelLayer[] }): void => {
      editorStore.loadProject(payload.project, payload.layers);
      editorStore.clearHistory();
      // An imported document has never been stored here, so make the next
      // autosave write it instead of treating it as already saved.
      editorStore.markDocumentDirty();
      setLibraryOpen(false);
    },
    [],
  );

  /* ---------------- global keyboard shortcuts ---------------- */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      // While a dialog or the drawer is open, only Escape is ours.
      if (isModalOpen) {
        if (event.key === 'Escape') {
          setNewProjectOpen(false);
          setExportOpen(false);
          setLibraryOpen(false);
          setDrawerOpen(false);
        }

        return;
      }

      const key = event.key.toLowerCase();
      const withModifier = event.ctrlKey || event.metaKey;

      if (withModifier) {
        if (key === 'z') {
          event.preventDefault();

          if (event.shiftKey) {
            history.redo();
          } else {
            history.undo();
          }

          return;
        }

        if (key === 'y') {
          event.preventDefault();
          history.redo();
          return;
        }

        // Never hijack other browser shortcuts.
        return;
      }

      if (event.altKey) {
        return;
      }

      // Tool selection comes straight from the registry, so a badge can never
      // disagree with the binding.
      const hotkeyTool: ToolType | undefined = TOOL_ID_BY_HOTKEY[event.key.toUpperCase()];

      if (hotkeyTool !== undefined) {
        event.preventDefault();
        selectTool(hotkeyTool);
        return;
      }

      switch (key) {
        case 'x':
          event.preventDefault();
          editorStore.swapColors();
          retroAudioEngine.playToolSelect();
          break;

        case 'd':
          event.preventDefault();
          editorStore.resetColors();
          retroAudioEngine.playToolSelect();
          break;

        case '+':
        case '=':
          event.preventDefault();
          editorStore.zoomIn();
          break;

        case '-':
        case '_':
          event.preventDefault();
          editorStore.zoomOut();
          break;

        case '0':
          event.preventDefault();
          editorStore.resetZoom();
          break;

        case 'f':
          event.preventDefault();
          editorStore.zoomToFit();
          break;

        case 'delete':
        case 'backspace':
          if (selectionBounds.pixelCount > 0) {
            event.preventDefault();

            if (selectionBounds.deleteSelectedPixels()) {
              retroAudioEngine.playActionSuccess();
            }
          }
          break;

        case 'escape':
          event.preventDefault();

          if (editorStore.getState().selection.active) {
            editorStore.clearSelection();
          } else {
            editorStore.setTool('pencil');
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [history, isModalOpen, selectTool, selectionBounds]);

  /* ---------------- panel nodes (shared by desktop panel and drawer) ---------------- */

  const toolsetPanel = (
    <ToolsetPanel
      activeTool={selectedTool}
      onSelectTool={selectTool}
      brushSize={brushSize}
      onBrushSizeChange={editorStore.setBrushSize}
      layout="grid"
      showBrushSize
    />
  );

  const symmetryPanel = (
    <SymmetryControls
      symmetryMode={symmetryMode}
      onChange={(mode: SymmetryMode) => {
        editorStore.setSymmetryMode(mode);
      }}
      showGuides={symmetryGuidesVisible}
      onToggleGuides={editorStore.setSymmetryGuidesVisible}
      variant="bar"
    />
  );

  const colorPickerPanel = (
    <ColorPickerPanel
      palette={activePalette}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      eyedropperActive={selectedTool === 'eyedropper'}
      onSelectPrimary={editorStore.setPrimaryColor}
      onSelectSecondary={editorStore.setSecondaryColor}
      onSwapColors={editorStore.swapColors}
      onResetColors={editorStore.resetColors}
      onToggleEyedropper={toggleEyedropper}
    />
  );

  const paletteManagerPanel = (
    <PaletteManager
      presets={PRESET_PALETTES}
      customPalettes={customPalettes}
      activePalette={activePalette}
      currentColor={primaryColor}
      onSelectPalette={editorStore.setActivePaletteId}
      onCreatePalette={createCustomPalette}
      onDeletePalette={editorStore.deleteCustomPalette}
      onAddColor={editorStore.addColorToActivePalette}
      onRemoveColor={editorStore.removeColorFromActivePalette}
      onReplaceColors={editorStore.replaceActivePaletteColors}
    />
  );

  const layerListPanel = (
    <LayerList
      layers={layers}
      activeLayerId={activeLayerId}
      dimensions={dimensions}
      onSelectLayer={editorStore.setActiveLayerId}
      onAddLayer={handleAddLayer}
      onDuplicateLayer={handleDuplicateLayer}
      onMergeDown={handleMergeLayer}
      onDeleteLayer={handleDeleteLayer}
      onReorderLayer={(layerId, newOrder) => {
        editorStore.reorderLayer(layerId, newOrder);
      }}
      onToggleVisible={editorStore.toggleLayerVisible}
      onToggleLocked={editorStore.toggleLayerLocked}
      onOpacityChange={editorStore.setLayerOpacity}
      onChangeBlendMode={editorStore.setLayerBlendMode}
      onRenameLayer={editorStore.renameLayer}
    />
  );

  const zoomPanel = (
    <ZoomControls
      zoom={viewport.zoom}
      onZoomIn={editorStore.zoomIn}
      onZoomOut={editorStore.zoomOut}
      onFitToScreen={editorStore.zoomToFit}
      onResetZoom={editorStore.resetZoom}
      variant="compact"
    />
  );

  const historyPanel = (
    <HistoryControls
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      undoActionName={history.undoActionName}
      redoActionName={history.redoActionName}
      onUndo={history.undo}
      onRedo={history.redo}
      historyDepth={history.historyDepth}
      historyLimit={history.historyLimit}
      variant="compact"
    />
  );

  const canvasViewport = <CanvasViewport className="h-full w-full" />;

  return (
    <>
      <AudioController label="sound" />

      <RetroHeader
        projectTitle={project.title}
        dimensions={dimensions}
        saveStatus={persistenceStatus}
        lastError={persistenceError}
        hasUnsavedChanges={storage.hasUnsavedChanges}
        scanlinesEnabled={settings.scanlinesEnabled}
        soundEnabled={settings.soundEffectsEnabled}
        gridVisible={settings.gridVisible}
        onToggleScanlines={editorStore.toggleScanlines}
        onToggleSound={() => {
          editorStore.setSoundEffectsEnabled(!settings.soundEffectsEnabled);
        }}
        onToggleGrid={() => {
          editorStore.setGridVisible(!settings.gridVisible);
        }}
        onNewProject={() => {
          setNewProjectOpen(true);
        }}
        onOpenLibrary={openLibrary}
        onOpenExport={() => {
          setExportOpen(true);
        }}
        onRenameProject={editorStore.setProjectTitle}
      />

      {/* -------------------------- Mobile (<768px) ------------------------- */}
      <div className="flex min-h-0 flex-1 flex-col tablet:hidden">
        {/*
          Flex-fill canvas: the header and dock are fixed heights, so the canvas
          absorbs the remainder — which lands on the 55-62% share the breakpoint
          matrix asks for without hardcoding a viewport percentage that would
          leave a gap on tall phones.
        */}
        <div className="relative min-h-[42vh] flex-1">{canvasViewport}</div>

        <MobileToolCarousel
          activeTool={selectedTool}
          onSelectTool={selectTool}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          onSwapColors={editorStore.swapColors}
          onOpenDrawer={openDrawer}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          onOpenLibrary={openLibrary}
          layerCount={layers.length}
          layersPanelOpen={drawerOpen && drawerTab === 'layers'}
        />
      </div>

      {/* --------------------- Tablet + desktop (>=768px) -------------------- */}
      <MainWorkbench
        className="hidden tablet:flex"
        toolRail={
          <>
            <ToolsetPanel
              activeTool={selectedTool}
              onSelectTool={selectTool}
              brushSize={brushSize}
              onBrushSizeChange={editorStore.setBrushSize}
              layout="rail"
              showBrushSize={false}
            />
            <span aria-hidden="true" className="arcade-divider my-1 w-8" />
            <HistoryControls
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              undoActionName={history.undoActionName}
              redoActionName={history.redoActionName}
              onUndo={history.undo}
              onRedo={history.redo}
              historyDepth={history.historyDepth}
              historyLimit={history.historyLimit}
              variant="compact"
              orientation="vertical"
            />
          </>
        }
        canvas={canvasViewport}
        rightPanel={
          <div className="flex flex-col gap-3">
            <RetroCard title="Tools" variant="panel">
              {toolsetPanel}
            </RetroCard>

            <RetroCard title="Colour" variant="panel">
              {colorPickerPanel}
            </RetroCard>

            <RetroCard title="Palette" variant="panel">
              {paletteManagerPanel}
            </RetroCard>

            <RetroCard title="Symmetry" variant="panel">
              {symmetryPanel}
            </RetroCard>

            <RetroCard title="Layers" variant="panel" bodyClassName="p-0">
              <div className="px-2 py-2">{layerListPanel}</div>
            </RetroCard>
          </div>
        }
        rightPanelFooter={
          <div className="flex flex-col gap-2">
            {zoomPanel}
            {historyPanel}
          </div>
        }
        status={{
          dimensions,
          activeTool: selectedTool,
          brushSize,
          zoom: viewport.zoom,
          historyDepth: history.historyDepth,
          historyLimit: history.historyLimit,
          layerCount: layers.length,
          saveStatus: persistenceStatus,
          hasUnsavedChanges: storage.hasUnsavedChanges,
        }}
        panelOpen={panelOpen}
        onTogglePanel={() => {
          setPanelOpen((open) => !open);
        }}
      />

      {/* --------------------------- Mobile drawer --------------------------- */}
      <MobileControlDrawer
        open={drawerOpen}
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        onClose={() => {
          setDrawerOpen(false);
        }}
        toolsPanel={
          <>
            {toolsetPanel}
            {symmetryPanel}
          </>
        }
        coloursPanel={
          <>
            {paletteManagerPanel}
            {colorPickerPanel}
          </>
        }
        layersPanel={layerListPanel}
        zoomPanel={zoomPanel}
      />

      {/* ------------------------------ Dialogs ------------------------------ */}
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => {
          setNewProjectOpen(false);
        }}
        onCreate={handleCreateProject}
        defaultTitle={project.title}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => {
          setExportOpen(false);
        }}
        project={project}
        layers={layers}
      />

      <ProjectLibraryModal
        open={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
        }}
        projects={storage.projects}
        activeProjectId={project.id}
        status={persistenceStatus}
        lastError={persistenceError}
        storageEstimate={storage.storageEstimate}
        onLoad={(projectId) => {
          void storage.loadProjectById(projectId).then((loaded) => {
            if (loaded) {
              setLibraryOpen(false);
            }
          });
        }}
        onDuplicate={(projectId) => {
          void storage.duplicateProjectById(projectId);
        }}
        onDelete={(projectId) => {
          void storage.deleteProjectById(projectId);
        }}
        onRefresh={() => {
          void storage.refreshLibrary();
        }}
        onImportProject={handleImportProject}
        onClearError={() => {
          projectStore.clearError();
        }}
      />

      {/* Shortcut reference for assistive technology; visually hidden. */}
      <p className="sr-only">
        Shortcuts:{' '}
        {TOOL_DEFINITIONS.filter((tool) => tool.hotkey !== null)
          .map((tool) => `${tool.hotkey} for ${tool.label}`)
          .join(', ')}
        . Control Z undo, Control Y redo, plus and minus zoom, zero resets zoom, F fits
        the artboard, X swaps colours, D resets colours, Delete clears the selection.
      </p>
    </>
  );
}

export default StudioPage;
