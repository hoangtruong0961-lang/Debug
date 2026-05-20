
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Sparkles, Eye, EyeOff } from 'lucide-react';
import { CharacterSheet, Entity, EntityType } from '../../../types';
import Button from '../../ui/Button';
import MarkdownRenderer from '../../common/MarkdownRenderer';
import { worldAiService } from '../../../services/ai/world-creation/service';
import { CharacterSheetEditor } from './CharacterSheetEditor';

interface EntityFormProps {
  initialData?: Entity;
  onSave: (entity: Omit<Entity, 'id'>) => void;
  onCancel: () => void;
}

const EntityForm: React.FC<EntityFormProps> = ({ initialData, onSave, onCancel }) => {
  const [type, setType] = useState<EntityType>(initialData?.type || 'NPC');
  
  // Normal state
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [rarity, setRarity] = useState(initialData?.rarity || '');
  const [price, setPrice] = useState(initialData?.price || '');
  const [customType, setCustomType] = useState(initialData?.customType || '');

  // NPC / Character state
  const [npcData, setNpcData] = useState<Partial<CharacterSheet>>(() => {
     if (initialData?.type === 'NPC') return { ...initialData };
     return {};
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  
  const handleSave = () => {
    if (type === 'NPC') {
       if (!npcData.name?.trim()) return;
       const entity: Omit<Entity, 'id'> = {
         type,
         name: npcData.name || '',
         description: npcData.description || npcData.appearance || '',
         ...npcData
       };
       onSave(entity);
       return;
    }

    if (!name.trim()) return;
    
    const entity: Omit<Entity, 'id'> = {
      type,
      name,
      description,
      ...(type === 'ITEM' && { rarity, price }),
      ...(type === 'CUSTOM' && { customType })
    };
    onSave(entity);
  };

  const handleAiSuggest = async (field: 'description' | 'personality') => {
    if (!name.trim()) {
        return;
    }

    setIsGenerating(true);
    try {
      const contextData = { name, type, genre: '' }; // Genre could be passed in props for better context if available
      
      // Determine current value for enrichment
      let currentValue = "";
      if (field === 'description') currentValue = description;
      if (field === 'personality') currentValue = npcData.personality || '';

      const content = await worldAiService.generateFieldContent('entity', field, contextData, 'gemini-3.1-pro-preview', currentValue);
      
      if (field === 'description') {
          setDescription(content);
      } else {
          setNpcData(prev => ({...prev, personality: content}));
      }
    } catch (error) {
        console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiGenKnowledge = async () => {
    if (!npcData.knowledge_train?.trim()) {
        alert("Vui lòng nhập dữ liệu gốc (Knowledge Base) trước.");
        return;
    }

    setIsGenerating(true);
    try {
      const generatedSheet = await worldAiService.generateCharacterSheetFromKnowledge(npcData.knowledge_train, 'gemini-3.1-pro-preview');
      setNpcData(prev => ({
        ...prev,
        ...generatedSheet,
        // Keep the original knowledge data
        knowledge_train: prev.knowledge_train
      }));
    } catch (error) {
      console.error(error);
      alert("Lỗi khi tạo hình nhân vật từ Knowledge.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto pt-20">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className={`bg-stone-200 dark:bg-mystic-900 w-full ${type === 'NPC' ? 'max-w-4xl' : 'max-w-lg'} rounded-lg border border-stone-400 dark:border-slate-700 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col`}
      >
        <div className="flex justify-between items-center p-4 border-b border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900 shrink-0">
          <h3 className="text-lg font-bold text-stone-800 dark:text-slate-200">
            {initialData ? 'Chỉnh sửa thực thể' : 'Thêm thực thể mới'}
          </h3>
          <button onClick={onCancel} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-2">
            <label className="text-sm font-medium text-mystic-accent">Phân loại bách khoa (Category)</label>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value as EntityType)}
              className="w-full bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-stone-900 dark:text-slate-100 focus:border-mystic-accent outline-none"
            >
              <option value="NPC">Nhân vật (NPC)</option>
              <option value="LOCATION">Địa điểm / Địa danh</option>
              <option value="ITEM">Vật phẩm & Cổ vật</option>
              <option value="FACTION">Phe phái & Tổ chức</option>
              <option value="CUSTOM">Tri thức & Khái niệm (Lore)</option>
            </select>
          </div>

          {type === 'NPC' ? (
              <div className="relative border border-stone-400/50 dark:border-slate-850 p-4 rounded-xl bg-stone-100/50 dark:bg-slate-950/25">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-3">
                      <span className="text-xs text-stone-500 italic pb-1">Đưa tư liệu thô của nhân vật vào để AI phân tích gieo hạt, hoặc tự tay điền các trường bên dưới.</span>
                      <Button
                          variant="secondary"
                          onClick={handleAiGenKnowledge}
                          disabled={isGenerating || !npcData.knowledge_train?.trim()}
                          icon={isGenerating ? <span className="animate-spin">⏳</span> : <Sparkles size={16} />}
                          className="py-1 px-3 text-xs bg-green-500 hover:bg-green-600 text-white font-bold"
                      >
                          {isGenerating ? "Đang xử lý..." : "AI TỰ ĐIỀN THẺ NHÂN VẬT"}
                      </Button>
                  </div>
                  {/* Cung cấp một trường nhập liệu thô (Knowledge base) để người dùng tiện dán văn bản rồi nhấn AI GEN */}
                  <div className="mb-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Tư liệu thô (Knowledge Base)</label>
                      <textarea
                          value={npcData.knowledge_train || ''}
                          onChange={(e) => setNpcData(prev => ({ ...prev, knowledge_train: e.target.value }))}
                          placeholder="Ví dụ: Lương Thế Vinh (1441 - 1496) trúng Trạng nguyên, giỏi toán học và phong thủy..."
                          className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none"
                      />
                  </div>
                  <CharacterSheetEditor 
                      data={npcData} 
                      onChange={(field, value) => setNpcData(prev => ({...prev, [field]: value}))} 
                  />
              </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-mystic-accent">Tên thực thể / bách khoa</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-stone-900 dark:text-slate-100 focus:border-mystic-accent outline-none"
                  placeholder={
                    type === 'LOCATION' ? "Ví dụ: Ải Chi Lăng, Tây Đô..." :
                    type === 'ITEM' ? "Ví dụ: Kiếm Thuận Thiên, Sách Lập Cực..." :
                    type === 'FACTION' ? "Ví dụ: Nghĩa quân Lam Sơn, Hội Tao Đàn..." :
                    "Ví dụ: Luật âm dương, Thuật bói toán..."
                  }
                />
              </div>

              <div className="space-y-2 relative">
                <label className="text-sm font-medium text-mystic-accent flex justify-between">
                  <div className="flex items-center gap-2">
                    <span>Nội dung mục từ (Entry Content)</span>
                    <button 
                      type="button"
                      onClick={() => setIsPreview(!isPreview)}
                      className="text-slate-400 hover:text-mystic-accent transition-colors"
                      title={isPreview ? "Chỉnh sửa" : "Xem trước Markdown"}
                    >
                      {isPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                  <button 
                    onClick={() => handleAiSuggest('description')} 
                    disabled={isGenerating || !name.trim()}
                    className="text-xs flex items-center gap-1 text-mystic-accent/80 hover:text-mystic-accent"
                    title={description ? "Cải thiện nội dung" : "Tạo mới ngẫu nhiên"}
                  >
                    {isGenerating ? <span className="animate-spin">⏳</span> : <Sparkles size={12} />} 
                    {description ? "AI Cải thiện" : "AI Gợi ý"}
                  </button>
                </label>
                {isPreview ? (
                  <div className="w-full h-44 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-3 text-stone-900 dark:text-slate-100 overflow-y-auto custom-scrollbar text-xs">
                    <MarkdownRenderer content={description || "*Chưa có nội dung mô tả.*"} />
                  </div>
                ) : (
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full h-44 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-3 text-stone-900 dark:text-slate-100 focus:border-mystic-accent outline-none resize-none text-sm leading-relaxed"
                    placeholder={
                      type === 'LOCATION' ? "Mô tả chi tiết địa hình, vai trò phòng hiểm, cảnh sắc đặc trưng..." :
                      type === 'ITEM' ? "Mô tả nguồn gốc, sức mạnh bí mật hay tác dụng phi thường của bảo vật..." :
                      type === 'FACTION' ? "Mô tả cơ cấu tổ chức, tôn chỉ hành động, thế lực hay mục tiêu cốt lõi..." :
                      "Giải nghĩa khái niệm, quy tắc vận hành hay nguồn tri thức độc đáo tồn tại trong bối cảnh thế giới..."
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
          <Button variant="ghost" onClick={onCancel}>Hủy</Button>
          <Button variant="primary" onClick={handleSave} icon={<Save size={16} />}>Lưu</Button>
        </div>
      </motion.div>
    </div>
  );
};

export default EntityForm;
