import React, { useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const AVAILABLE_MODELS = {
  gpt: [
    'gpt-5.2',
    'gpt-5.1',
    'gpt-4o',
    'o3',
    'o3-pro',
    'o4-mini'
  ],
  claude: [
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-5-20251101',
    'claude-haiku-4-5-20251001',
    'claude-4-sonnet-20250514'
  ],
  gemini: [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
  ],
  grok: [
    'grok-3',
    'grok-4',
    'grok-2-latest'
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner'
  ],
  perplexity: [
    'sonar-pro',
    'sonar-deep-research'
  ]
};

const MODEL_COLORS = {
  gpt: '#10A37F',
  claude: '#D97757',
  gemini: '#4285F4',
  perplexity: '#22B8CF',
  grok: '#FFFFFF',
  deepseek: '#4D6BFE'
};

const getModelType = (model) => {
  const lower = model.toLowerCase();
  if (lower.includes('gpt') || lower.startsWith('o')) return 'gpt';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('perplexity') || lower.includes('sonar')) return 'perplexity';
  if (lower.includes('grok')) return 'grok';
  if (lower.includes('deepseek')) return 'deepseek';
  return 'unknown';
};

export default function ModelSelector({ selectedModels, onChange, maxModels = 6 }) {
  const [open, setOpen] = useState(false);

  const handleToggleModel = (model) => {
    if (selectedModels.includes(model)) {
      onChange(selectedModels.filter(m => m !== model));
    } else {
      if (selectedModels.length >= maxModels) {
        toast.error(`Maximum ${maxModels} models allowed`);
        return;
      }
      onChange([...selectedModels, model]);
    }
  };

  const handleRemoveModel = (model) => {
    onChange(selectedModels.filter(m => m !== model));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Models:</span>
      
      {selectedModels.map(model => {
        const modelType = getModelType(model);
        return (
          <Badge
            key={model}
            variant="outline"
            className={`model-badge-${modelType} flex items-center gap-1`}
            data-testid={`selected-model-${model}`}
          >
            {model}
            <button
              onClick={() => handleRemoveModel(model)}
              className="ml-1 hover:text-foreground"
              data-testid={`remove-model-${model}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" data-testid="add-model-btn">
            <Plus className="h-4 w-4 mr-1" />
            {selectedModels.length === 0 ? 'Select Models' : 'Change'}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select AI Models</DialogTitle>
            <DialogDescription>
              Choose up to 2 models to compare side-by-side
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="gpt" className="w-full">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="gpt">GPT</TabsTrigger>
              <TabsTrigger value="claude">Claude</TabsTrigger>
              <TabsTrigger value="gemini">Gemini</TabsTrigger>
              <TabsTrigger value="grok">Grok</TabsTrigger>
              <TabsTrigger value="deepseek">DeepSeek</TabsTrigger>
              <TabsTrigger value="perplexity">Perplexity</TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-64 mt-4">
              {Object.entries(AVAILABLE_MODELS).map(([provider, models]) => (
                <TabsContent key={provider} value={provider}>
                  <div className="space-y-2">
                    {models.map(model => (
                      <Button
                        key={model}
                        variant={selectedModels.includes(model) ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => {
                          handleToggleModel(model);
                          if (selectedModels.length >= 1 && !selectedModels.includes(model)) {
                            setOpen(false);
                          }
                        }}
                        style={{
                          borderColor: MODEL_COLORS[provider] + '40',
                          ...(selectedModels.includes(model) && {
                            backgroundColor: MODEL_COLORS[provider] + '20',
                            color: MODEL_COLORS[provider]
                          })
                        }}
                        data-testid={`model-option-${model}`}
                      >
                        {model}
                        {selectedModels.includes(model) && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            Selected
                          </Badge>
                        )}
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
