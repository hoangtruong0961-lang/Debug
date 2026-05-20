import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Library,
  Search,
  X,
  Trash2,
  RefreshCw,
  Edit3,
  Plus,
  Save,
  Type,
  BrainCircuit,
  Download,
  Upload,
  AlertOctagon,
  User,
  MapPin,
  Flag,
  Package,
  Heart,
  Calendar,
  Globe,
  Filter,
  BookOpen,
  Star,
  BarChart3,
  TrendingUp,
  Tags,
  ChevronRight,
  Scale
} from "lucide-react";
import { dbService, VectorData } from "../../../../services/db/indexedDB";
import { vectorService } from "../../../../services/ai/vectorService";
import { storyBibleService } from "../../../../services/ai/storyBibleService";
import { WorldData, AppSettings } from "../../../../types";
import MarkdownRenderer from "../../../common/MarkdownRenderer";
import { ScribeMonitor } from "./encyclopedia/ScribeMonitor";
import { TokenBudgetMonitor } from "./encyclopedia/TokenBudgetMonitor";
import { TriggerDebugger } from "./encyclopedia/TriggerDebugger";
import { EntryEditor } from "./encyclopedia/EntryEditor";
import { EntryListView } from "./encyclopedia/EntryListView";

const CATEGORY_MAP: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  character: {
    label: "Nhân vật",
    color:
      "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50",
    icon: User,
  },
  location: {
    label: "Địa điểm",
    color:
      "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/50",
    icon: MapPin,
  },
  faction: {
    label: "Thế lực",
    color:
      "text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800/50",
    icon: Flag,
  },
  item: {
    label: "Vật phẩm",
    color:
      "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/50",
    icon: Package,
  },
  relationship: {
    label: "Mối quan hệ",
    color:
      "text-pink-600 bg-pink-100 dark:text-pink-400 dark:bg-pink-900/30 border-pink-200 dark:border-pink-800/50",
    icon: Heart,
  },
  event: {
    label: "Sự kiện",
    color:
      "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30 border-red-200 dark:border-red-800/50",
    icon: Calendar,
  },
  law: {
    label: "Luật lệ",
    color:
      "text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800/50",
    icon: Scale,
  },
  world: {
    label: "Thế giới",
    color:
      "text-stone-600 bg-stone-100 dark:text-stone-400 dark:bg-stone-800/50 border-stone-300 dark:border-stone-700/50",
    icon: Globe,
  },
};

interface StoryBibleSidebarProps {
  worldData: WorldData;
}

const StoryBibleSidebar: React.FC<StoryBibleSidebarProps> = ({ worldData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [entries, setEntries] = useState<VectorData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [viewMode, setViewMode] = useState<'keyword' | 'semantic' | 'trigger_editor' | 'token_budget'>('keyword');
  const isAiSearch = viewMode === 'semantic';
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);
  const [semanticResults, setSemanticResults] = useState<VectorData[] | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  const [activeMonitorTab, setActiveMonitorTab] = useState<'scribe' | 'semantic' | 'trigger_editor' | 'token_budget'>('trigger_editor');

  // Edit & Add State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<VectorData>>({});

  const [isAdding, setIsAdding] = useState(false);
  const [addData, setAddData] = useState<Partial<VectorData>>({ 
      category: 'world', 
      triggerMode: 'hybrid', 
      priority: 50, 
      isEnabled: true, 
      position: 'before_char' 
  });

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const campaignId =
    worldData.id ||
    `campaign-${worldData.world?.worldName?.replace(/\s+/g, "")}-${worldData.player?.name?.replace(/\s+/g, "")}`;

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const allVectors = await dbService.getAllVectors();
      const storyBibleVectors = allVectors.filter(
        (v) => v.role === "story_bible" && v.saveId === campaignId,
      );
      storyBibleVectors.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(storyBibleVectors);

      const loadedSettings = (await dbService.getSettings()) as AppSettings;
      setSettings(loadedSettings);
    } catch (e) {
      console.error("Failed to load StoryBible entries", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (isOpen) {
      loadEntries();
      // Thêm auto-refresh mỗi 5s để cập nhật ngay nếu background service đang trích xuất
      intervalId = setInterval(() => {
        loadEntries();
      }, 5000);
    }
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, campaignId]);

  const filteredEntries = useMemo(() => {
    let currentList = entries;

    if (isAiSearch && semanticResults !== null) {
      currentList = semanticResults;
    }

    if (activeCategoryFilter) {
      currentList = currentList.filter(
        (e) => (e.category || "world") === activeCategoryFilter,
      );
    }

    if (!searchTerm) return currentList;

    const lowerSearch = searchTerm.toLowerCase();
    return currentList.filter(
      (entry) =>
        (entry.keyword && entry.keyword.toLowerCase().includes(lowerSearch)) ||
        (entry.text && entry.text.toLowerCase().includes(lowerSearch)),
    );
  }, [entries, searchTerm, isAiSearch, semanticResults, activeCategoryFilter]);

  useEffect(() => {
    // Reset semantic results when switching mode or clearing term
    if (!isAiSearch || !searchTerm) {
      setSemanticResults(null);
    }
  }, [isAiSearch, searchTerm]);

  const handleSemanticSearch = async () => {
    if (!searchTerm.trim() || !settings) return;
    setIsSearchingSemantic(true);
    try {
      const tempSettings = { ...settings, enableVectorMemory: true };
      // Map StoryBibleEntry to VectorData shape for the UI
      const entriesData = await storyBibleService.queryContext(
        searchTerm,
        [],
        campaignId,
        tempSettings,
      );
      const results = entriesData.map(
        (e) =>
          ({
            id: e.id,
            keyword: e.title,
            text: e.content,
            category: e.category,
            timestamp: e.updatedAt,
            role: "story_bible",
            saveId: campaignId,
            score: e.confidence, // approximated
          }) as VectorData,
      );
      setSemanticResults(results);
    } catch (e) {
      console.error("Semantic search error", e);
      alert("Lỗi khi tìm kiếm ngữ nghĩa");
    } finally {
      setIsSearchingSemantic(false);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(entries, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", `StoryBible_${campaignId}.json`);
    linkElement.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as VectorData[];
        if (!Array.isArray(parsed)) throw new Error("Invalid format");

        if (
          window.confirm(
            `Bạn có muốn nạp ${parsed.length} dữ kiện? Dữ liệu cũ có cùng ID sẽ bị ghi đè.`,
          )
        ) {
          setIsLoading(true);
          for (const entry of parsed) {
            if (entry.id && entry.text && entry.embedding) {
              entry.role = "story_bible";
              entry.saveId = campaignId;
              await dbService.saveVector(entry);
            }
          }
          await loadEntries();
          alert("Nạp thành công!");
        }
      } catch (err) {
        alert("Lỗi đọc file JSON. File không hợp lệ.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset
  };

  const handleDeleteAll = async () => {
    if (
      window.confirm(
        "CẢNH BÁO: Encyclopedia hiện tại sẽ bị xóa sạch hoàn toàn. AI sẽ quên mọi dữ kiện. Bạn có chắc chắn?",
      )
    ) {
      setIsLoading(true);
      try {
        for (const e of entries) {
          await dbService.deleteVector(e.id);
        }
        setEntries([]);
      } catch (err) {
        alert("Có lỗi khi xóa");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        "Bạn có chắc chắn muốn xóa mục này khỏi Encyclopedia? AI sẽ quên dữ kiện này.",
      )
    ) {
      await dbService.deleteVector(id);
      setEntries(entries.filter((e) => e.id !== id));
    }
  };

  const startEdit = (entry: VectorData) => {
    setEditingId(entry.id);
    setEditData({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (entry: VectorData) => {
    if (!editData.keyword?.trim() || !editData.text?.trim()) return;
    setIsLoading(true);
    try {
      // Only recalculate embedding if text or keyword changed
      let newEmbedding = entry.embedding;
      if (entry.keyword !== editData.keyword || entry.text !== editData.text) {
        const embeddingStr = `${editData.keyword}: ${editData.text}`;
        const calcEmbedding = await vectorService.getEmbedding(embeddingStr); // Uses default settings if none passsed
        if (calcEmbedding) newEmbedding = calcEmbedding;
      }

      const currentTimestamp = Date.now();
      let newHistory = entry.updateHistory || [];
      if (entry.text !== editData.text) {
        newHistory = [{ timestamp: currentTimestamp, content: editData.text || '' }];
      }

      const updatedEntry: VectorData = {
        ...entry,
        ...editData, // applies all changes
        embedding: newEmbedding,
        updateHistory: newHistory,
        timestamp: currentTimestamp, // update timestamp to bubble up
      };

      await dbService.saveVector(updatedEntry);

      setEntries((prev) =>
        prev
          .map((e) => (e.id === entry.id ? updatedEntry : e))
          .sort((a, b) => b.timestamp - a.timestamp),
      );
      setEditingId(null);
    } catch (e) {
      console.error("Error saving edit", e);
      alert("Lỗi khi lưu dữ kiện.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddManual = async () => {
    if (!addData.keyword?.trim() || !addData.text?.trim()) {
      alert("Vui lòng nhập cả Từ khóa và Nội dung.");
      return;
    }
    setIsLoading(true);
    try {
      const docId = `sb-${campaignId}-manual-${Date.now()}`;
      const embeddingStr = `${addData.keyword}: ${addData.text}`;
      const embedding = await vectorService.getEmbedding(embeddingStr);

      if (!embedding) throw new Error("Could not generate embedding");

      const newEntry: VectorData = {
        ...addData,
        id: docId,
        text: addData.text || '',
        embedding,
        timestamp: Date.now(),
        role: "story_bible",
        saveId: campaignId,
        keyword: addData.keyword || '',
        updateHistory: [
          { timestamp: Date.now(), content: `[Thêm thủ công]:\n${addData.text}` },
        ],
      } as VectorData;

      await dbService.saveVector(newEntry);
      setEntries((prev) => [newEntry, ...prev]);
      setIsAdding(false);
      setAddData({ 
        category: 'world', 
        triggerMode: 'hybrid', 
        priority: 50, 
        isEnabled: true, 
        position: 'before_char' 
      });
    } catch (e) {
      console.error("Error adding manual entry", e);
      alert("Lỗi khi thêm dữ kiện mới. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newEntriesCount = entries.filter((e) => e.timestamp > oneDayAgo).length;
  const avgLength =
    entries.length > 0
      ? Math.round(
          entries.reduce((acc, e) => acc + (e.text?.length || 0), 0) /
            entries.length,
        )
      : 0;

  const tagCounts = entries.reduce(
    (acc, e) => {
      const cat = e.category || "world";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const popularTagId =
    Object.keys(tagCounts).length > 0
      ? Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors group rounded-lg border border-stone-400 dark:border-slate-700 bg-stone-300 dark:bg-slate-800/30 mb-3"
      >
        <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors uppercase">
          <Library size={14} />
          Encyclopedia
        </div>
        <div className="text-[10px] text-stone-500 bg-stone-400 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700 font-mono">
          Vector DB
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            style={{ zIndex: 1000 }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-[95vw] max-w-[1400px] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-stone-300 dark:border-slate-800 bg-stone-100 dark:bg-slate-900/95 shrink-0 shadow-sm flex items-center justify-between z-10">
                <div className="flex flex-col">
                  <h2 className="text-2xl font-black text-stone-900 dark:text-white flex items-center gap-3 tracking-tighter uppercase relative">
                    <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-xl border border-amber-200 dark:border-amber-500/30">
                      <BookOpen
                        size={20}
                        className="text-amber-600 dark:text-amber-500"
                      />
                    </div>
                    <div>
                      Encyclopedia Manager
                      <div className="text-[10px] font-bold text-stone-500 dark:text-slate-400 font-mono tracking-widest mt-0.5 uppercase flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        Vector Database Active • {entries.length} Entries
                      </div>
                    </div>
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsAdding(!isAdding)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors shadow-sm ${
                      isAdding
                        ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30"
                        : "bg-stone-50 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700"
                    }`}
                  >
                    {isAdding ? <X size={16} /> : <Plus size={16} />}
                    {isAdding ? "Hủy Thêm" : "Thêm Dữ Kiện Mới"}
                  </button>
                  <div className="h-8 w-px bg-stone-300 dark:bg-slate-700 mx-2"></div>
                  <div className="flex gap-1">
                    <button
                      onClick={handleExport}
                      className="flex items-center p-2.5 rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-amber-500 hover:bg-stone-200 dark:hover:bg-amber-500/10 transition-colors tooltip-trigger relative"
                      title="Xuất JSON Database"
                    >
                      <Download size={18} />
                    </button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                        title="Nhập JSON Database"
                      />
                      <button className="flex items-center p-2.5 rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-amber-500 hover:bg-stone-200 dark:hover:bg-amber-500/10 transition-colors pointer-events-none">
                        <Upload size={18} />
                      </button>
                    </div>
                    <button
                      onClick={handleDeleteAll}
                      className="flex items-center p-2.5 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/40 border border-transparent transition-colors"
                      title="Factory Reset DB"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="w-px h-8 bg-stone-300 dark:bg-slate-700 mx-2"></div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-2 rounded-xl hover:bg-stone-200 dark:hover:bg-slate-800 transition-colors border border-transparent"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex flex-1 flex-col lg:flex-row overflow-hidden relative">
                {isLoading && (
                  <div className="absolute inset-0 z-50 bg-stone-200/50 dark:bg-mystic-900/50 backdrop-blur-[1px] flex justify-center items-center">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-stone-300 dark:border-slate-700 shadow-xl flex items-center gap-3">
                      <RefreshCw
                        size={20}
                        className="animate-spin text-amber-600 dark:text-amber-500"
                      />
                      <span className="text-stone-700 dark:text-slate-300 font-medium">
                        Đang xử lý dữ kiện...
                      </span>
                    </div>
                  </div>
                )}

                {/* List Sidebar */}
                <div className={`w-full lg:w-[300px] xl:w-[320px] shrink-0 flex-col bg-stone-100 dark:bg-slate-900 ${
                  (selectedEntryId || isAdding) ? 'hidden lg:flex' : 'flex h-full'
                }`}>
                  <EntryListView
                    entries={entries}
                    selectedId={selectedEntryId}
                    onSelect={(id) => {
                      setSelectedEntryId(id);
                      setEditingId(null);
                      setIsAdding(false);
                    }}
                    onAdd={() => setIsAdding(true)}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    renderTool={() => {
                        if (viewMode === 'trigger_editor') return <TriggerDebugger entries={entries} />;
                        if (viewMode === 'token_budget') return <TokenBudgetMonitor entries={entries} />;
                        return null;
                    }}
                    onSemanticSearch={handleSemanticSearch}
                    isSearchingSemantic={isSearchingSemantic}
                    activeCategoryFilter={activeCategoryFilter}
                    onCategoryFilterChange={setActiveCategoryFilter}
                    filteredEntries={filteredEntries}
                    CATEGORY_MAP={CATEGORY_MAP}
                  />
                </div>

                {/* Center: Detail View */}
                <div className={`flex-1 min-w-0 bg-white dark:bg-mystic-900 relative flex-col overflow-hidden lg:border-l lg:border-r border-stone-300 dark:border-slate-800 ${
                  (!selectedEntryId && !isAdding) ? 'hidden lg:flex' : 'flex h-full lg:h-auto lg:flex-1'
                }`}>
                  <div className="flex-1 overflow-hidden flex flex-col">
                    {isAdding ? (
                      <EntryEditor
                        formData={addData}
                        onChange={(field, value) => setAddData(prev => ({...prev, [field]: value}))}
                        onSave={handleAddManual}
                        onCancel={() => setIsAdding(false)}
                        isSaving={isLoading}
                        isEditing={false}
                      />
                    ) : selectedEntry && editingId === selectedEntry.id ? (
                      <EntryEditor
                        formData={editData}
                        onChange={(field, value) => setEditData(prev => ({...prev, [field]: value}))}
                        onSave={() => saveEdit(selectedEntry)}
                        onCancel={cancelEdit}
                        isSaving={isLoading}
                        isEditing={true}
                      />
                    ) : selectedEntry ? (
                      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
                        {/* Preview Header */}
                        <div className="px-4 lg:px-8 py-4 lg:py-6 border-b border-stone-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shrink-0 flex items-start justify-between gap-4 backdrop-blur">
                          <div className="flex-1 max-w-3xl flex flex-col gap-2">
                             <div className="flex items-center gap-2 lg:hidden mb-2">
                                <button onClick={() => setSelectedEntryId(null)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-300 rounded-lg">
                                  <ChevronRight size={14} className="rotate-180" /> Trở lại danh sách
                                </button>
                             </div>
                            <h2 className="text-2xl lg:text-4xl font-black text-stone-900 dark:text-white tracking-tighter uppercase mb-1 lg:mb-3 leading-tight">
                              {selectedEntry.keyword || "Không tên"}
                            </h2>
                            <div className="flex flex-wrap items-center gap-3">
                              {selectedEntry.category &&
                                CATEGORY_MAP[selectedEntry.category] && (
                                  <div
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border ${CATEGORY_MAP[selectedEntry.category].color}`}
                                  >
                                    {React.createElement(
                                      CATEGORY_MAP[selectedEntry.category].icon,
                                      { size: 14 },
                                    )}
                                    {CATEGORY_MAP[selectedEntry.category].label}
                                  </div>
                                )}
                              {selectedEntry.triggerMode && (
                                <div className="px-3 py-1.5 bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 rounded-lg text-[11px] uppercase font-bold border border-stone-300 dark:border-slate-700 tracking-widest">
                                  Mode: {selectedEntry.triggerMode}
                                </div>
                              )}
                              {selectedEntry.keywords &&
                                selectedEntry.keywords.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {selectedEntry.keywords.map((kw, idx) => (
                                      <span
                                        key={idx}
                                        className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 rounded-lg text-[11px] font-bold border border-amber-200 dark:border-amber-800/50 tracking-wider"
                                      >
                                        #{kw}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm">
                            <button
                              onClick={() => startEdit(selectedEntry)}
                              className="p-2.5 text-stone-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded-xl transition-all"
                              title="Sửa mục"
                            >
                              <Edit3 size={18} />
                            </button>
                            <div className="w-px h-6 bg-stone-200 dark:bg-slate-800 mx-1"></div>
                            <button
                              onClick={() => {
                                handleDelete(selectedEntry.id);
                                setSelectedEntryId(null);
                              }}
                              className="p-2.5 text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-xl transition-all"
                              title="Xóa mục"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        {/* Preview Content */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                          <div className="max-w-4xl space-y-6">
                            <div className="bg-stone-50 dark:bg-slate-900/50 rounded-xl p-6 border border-stone-200 dark:border-slate-800 shadow-sm content-block markdown-prose text-stone-800 dark:text-slate-200">
                              {selectedEntry.text}
                            </div>

                            {/* Changelog partial view */}
                            {selectedEntry.updateHistory &&
                              selectedEntry.updateHistory.length > 0 && (
                                <div className="mt-8">
                                  <h4 className="text-xs font-black text-stone-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <RefreshCw
                                      size={14}
                                      className="text-amber-500/50"
                                    />{" "}
                                    Lịch sử thay đổi
                                  </h4>
                                  <div className="space-y-4">
                                    {selectedEntry.updateHistory
                                      .slice()
                                      .reverse()
                                      .slice(0, 3)
                                      .map((hist, idx) => (
                                        <div
                                          key={idx}
                                          className="text-[11px] text-stone-500 dark:text-slate-400 border-l-[2px] border-stone-300 dark:border-slate-700 pl-3"
                                        >
                                          <span className="font-bold text-amber-600 dark:text-amber-500">
                                            [
                                            {new Date(
                                              hist.timestamp,
                                            ).toLocaleString()}
                                            ]
                                          </span>
                                          <p className="mt-1 line-clamp-3">
                                            {hist.content}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-500 dark:text-slate-400 h-full bg-white dark:bg-mystic-900">
                        <BookOpen
                          size={64}
                          className="mb-4 text-stone-300 dark:text-slate-700 opacity-50"
                        />
                        <p className="text-lg font-bold mb-12 uppercase tracking-widest">
                          Chọn một mục để xét duyệt
                        </p>

                        <div className="w-full max-w-lg mt-8 bg-stone-50 dark:bg-slate-900/30 rounded-3xl border border-stone-200 dark:border-slate-800 p-8 shadow-sm">
                          <h3 className="font-black text-stone-800 dark:text-slate-200 mb-8 flex items-center justify-center gap-2 text-xl uppercase tracking-tighter">
                            <BarChart3 className="text-amber-500" /> Phân Tích
                            Dữ Liệu
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col items-center p-5 bg-white dark:bg-slate-900/80 border border-stone-100 dark:border-slate-800 rounded-2xl shadow-sm">
                              <Library
                                className="text-amber-500 mb-3"
                                size={28}
                              />
                              <span className="text-xs uppercase tracking-widest font-bold text-stone-400 mb-1">
                                Tổng mục
                              </span>
                              <span className="text-3xl font-black text-stone-800 dark:text-white">
                                {entries.length}
                              </span>
                            </div>
                            <div className="flex flex-col items-center p-5 bg-white dark:bg-slate-900/80 border border-stone-100 dark:border-slate-800 rounded-2xl shadow-sm">
                              <Star
                                className="text-emerald-500 mb-3"
                                size={28}
                              />
                              <span className="text-xs uppercase tracking-widest font-bold text-stone-400 mb-1">
                                Dữ kiện 24h
                              </span>
                              <span className="text-3xl font-black text-stone-800 dark:text-white">
                                {newEntriesCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Sidebar: Monitors */}
                <div className="hidden xl:flex w-[360px] shrink-0 flex-col bg-stone-200 dark:bg-slate-950 border-l border-stone-300 dark:border-slate-800">
                  <div className="flex items-center gap-1 p-2 border-b border-stone-300 dark:border-slate-800 bg-stone-100 dark:bg-slate-900 overflow-x-auto shrink-0 custom-scrollbar">
                     <button 
                       onClick={() => setActiveMonitorTab('scribe')}
                       className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeMonitorTab === 'scribe' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30' : 'text-stone-500 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200'}`}
                     >
                       <Type size={14} /> Text
                     </button>
                     <button 
                       onClick={() => setActiveMonitorTab('semantic')}
                       className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeMonitorTab === 'semantic' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-500/30' : 'text-stone-500 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200'}`}
                     >
                       <BrainCircuit size={14} /> Semantic
                     </button>
                     <button 
                       onClick={() => setActiveMonitorTab('trigger_editor')}
                       className={`px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeMonitorTab === 'trigger_editor' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30' : 'text-stone-500 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200'}`}
                     >
                       <Filter size={14} /> Trigger Editor
                     </button>
                     <button 
                       onClick={() => setActiveMonitorTab('token_budget')}
                       className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeMonitorTab === 'token_budget' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/30' : 'text-stone-500 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200'}`}
                     >
                       <AlertOctagon size={14} /> Budget
                     </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    {activeMonitorTab === 'scribe' && (
                      <div className="h-full flex flex-col">
                        <h3 className="text-xs font-black uppercase text-stone-500 dark:text-slate-400 mb-2">Text Triggers & Scribe Logs</h3>
                        <ScribeMonitor entries={entries} />
                      </div>
                    )}
                    {activeMonitorTab === 'semantic' && (
                      <div className="h-full flex flex-col">
                        <h3 className="text-xs font-black uppercase text-stone-500 dark:text-slate-400 mb-2">Semantic AI Triggers</h3>
                        <div className="bg-stone-50 dark:bg-slate-900 p-4 rounded-xl border border-stone-200 dark:border-slate-800 text-sm text-stone-600 dark:text-slate-300">
                          Bộ theo dõi độ tương đồng ngữ nghĩa ẩn đang lấy vector. (Tính năng này sẽ được mở rộng để xem điểm số cosine similarity trực tiếp của các entry).
                        </div>
                      </div>
                    )}
                    {activeMonitorTab === 'trigger_editor' && (
                      <div className="h-full flex flex-col">
                         <h3 className="text-xs font-black uppercase text-stone-500 dark:text-slate-400 mb-2">Visual Trigger Editor</h3>
                        <TriggerDebugger entries={entries} />
                      </div>
                    )}
                    {activeMonitorTab === 'token_budget' && (
                      <div className="h-full flex flex-col">
                         <h3 className="text-xs font-black uppercase text-stone-500 dark:text-slate-400 mb-2">Token Budget Monitor</h3>
                        <TokenBudgetMonitor entries={entries} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`
  .markdown-prose p { margin-bottom: 1em; }
  .markdown-prose p:last-child { margin-bottom: 0; }
  .markdown-prose blockquote { border-left: 4px solid #f59e0b; padding-left: 1em; font-style: italic; opacity: 0.8; }
  .markdown-prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
  .markdown-prose ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1em; }
  .markdown-prose li { margin-bottom: 0.25em; }
  .markdown-prose h1, .markdown-prose h2, .markdown-prose h3 { font-weight: 900; margin-top: 1.5em; margin-bottom: 0.5em; color: inherit; letter-spacing: -0.025em; }
  .markdown-prose strong { font-weight: 900; color: inherit; }
  .markdown-prose em { font-style: italic; opacity: 0.9; }
`}</style>
    </>
  );
};

export default StoryBibleSidebar;
