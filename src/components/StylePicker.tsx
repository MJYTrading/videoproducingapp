import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { VIDEO_STYLES, Style, SubStyle } from '../data/styles';

interface StylePickerProps {
  selectedStyle: string;
  selectedParent: string | null;
  onStyleChange: (styleId: string, parentId: string | null) => void;
  onCustomStyleChange?: (custom: string) => void;
  customStyle?: string;
}

export default function StylePicker({
  selectedStyle, selectedParent, onStyleChange, onCustomStyleChange, customStyle
}: StylePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(selectedParent);

  useEffect(() => { if (selectedParent) setExpandedParent(selectedParent); }, [selectedParent]);

  const handleMainStyleClick = (style: Style) => {
    if (style.subStyles) { setExpandedParent(expandedParent === style.id ? null : style.id); }
    else { onStyleChange(style.id, null); setExpandedParent(null); }
  };

  const handleSubStyleClick = (subStyle: SubStyle, parentId: string) => {
    onStyleChange(subStyle.id, parentId);
  };

  const isSelected = (styleId: string, parentId: string | null) => {
    return selectedStyle === styleId && selectedParent === parentId;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {VIDEO_STYLES.map((style) => {
          const hasSubStyles = !!style.subStyles;
          const isExpanded = expandedParent === style.id;
          const isMainSelected = !hasSubStyles && isSelected(style.id, null);

          return (
            <div key={style.id} className="space-y-2">
              <button
                onClick={() => handleMainStyleClick(style)}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left relative group ${
                  isMainSelected
                    ? 'border-brand-500/60 bg-brand-500/8 shadow-glow-sm'
                    : 'border-white/[0.06] bg-surface-200/40 hover:border-white/[0.1] hover:bg-surface-200/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{style.name}</h4>
                      {hasSubStyles && (
                        <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{style.description}</p>
                  </div>
                </div>
              </button>

              {hasSubStyles && isExpanded && (
                <div className="ml-4 space-y-1.5 animate-fade-in-down">
                  {style.subStyles!.map((subStyle) => {
                    const isSubSelected = isSelected(subStyle.id, style.id);
                    return (
                      <button
                        key={subStyle.id}
                        onClick={() => handleSubStyleClick(subStyle, style.id)}
                        className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                          isSubSelected
                            ? 'border-brand-500/60 bg-brand-500/8 shadow-glow-sm'
                            : 'border-white/[0.04] bg-surface-200/30 hover:border-white/[0.08] hover:bg-surface-200/50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{subStyle.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-xs">{subStyle.name}</h5>
                            <p className="text-[11px] text-zinc-500 mt-0.5">{subStyle.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <button onClick={() => setShowCustom(!showCustom)} className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium">
          + Custom stijl beschrijven
        </button>
        {showCustom && (
          <div className="mt-3 animate-fade-in-down">
            <textarea
              value={customStyle || ''}
              onChange={(e) => onCustomStyleChange?.(e.target.value)}
              placeholder="Beschrijf je gewenste visuele stijl, bijvoorbeeld: 'Anime stijl met pasteltinten en zachte schaduwen'..."
              className="input-base text-sm h-24 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
