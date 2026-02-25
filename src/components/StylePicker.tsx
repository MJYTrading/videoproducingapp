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
  selectedStyle,
  selectedParent,
  onStyleChange,
  onCustomStyleChange,
  customStyle
}: StylePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(selectedParent);

  useEffect(() => {
    if (selectedParent) {
      setExpandedParent(selectedParent);
    }
  }, [selectedParent]);

  const handleMainStyleClick = (style: Style) => {
    if (style.subStyles) {
      setExpandedParent(expandedParent === style.id ? null : style.id);
    } else {
      onStyleChange(style.id, null);
      setExpandedParent(null);
    }
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
                className={`w-full p-4 rounded-lg border-2 transition-all text-left relative ${
                  isMainSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{style.name}</h4>
                      {hasSubStyles && (
                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{style.description}</p>
                  </div>
                </div>
              </button>

              {hasSubStyles && isExpanded && (
                <div className="ml-4 space-y-2 animate-in slide-in-from-top-2">
                  {style.subStyles!.map((subStyle) => {
                    const isSubSelected = isSelected(subStyle.id, style.id);

                    return (
                      <button
                        key={subStyle.id}
                        onClick={() => handleSubStyleClick(subStyle, style.id)}
                        className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                          isSubSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600 hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xl">{subStyle.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-sm">{subStyle.name}</h5>
                            <p className="text-xs text-zinc-400 mt-0.5">{subStyle.description}</p>
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

      <div className="pt-2 border-t border-zinc-800">
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Custom stijl beschrijven
        </button>

        {showCustom && (
          <div className="mt-3">
            <textarea
              value={customStyle || ''}
              onChange={(e) => onCustomStyleChange?.(e.target.value)}
              placeholder="Beschrijf je gewenste visuele stijl, bijvoorbeeld: 'Anime stijl met pasteltinten en zachte schaduwen'..."
              className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
