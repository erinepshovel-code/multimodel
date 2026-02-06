import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { ArrowLeft, ExternalLink, Key, Lock } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Configure axios to send cookies for authentication
axios.defaults.withCredentials = true;

const API_KEY_GUIDES = {
  gpt: {
    name: 'OpenAI GPT',
    url: 'https://platform.openai.com/api-keys',
    color: '#10A37F',
    universal: true
  },
  claude: {
    name: 'Anthropic Claude',
    url: 'https://console.anthropic.com/settings/keys',
    color: '#D97757',
    universal: true
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://makersuite.google.com/app/apikey',
    color: '#4285F4',
    universal: true
  },
  grok: {
    name: 'xAI Grok',
    url: 'https://console.x.ai/',
    color: '#FFFFFF',
    universal: false
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://platform.deepseek.com/',
    color: '#4D6BFE',
    universal: false
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/settings/api',
    color: '#22B8CF',
    universal: false
  }
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState({});
  const [useUniversal, setUseUniversal] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const response = await axios.get(`${API}/keys`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const loadedKeys = response.data;
      setKeys(loadedKeys);
      
      // Set universal flags
      const universalFlags = {};
      Object.entries(loadedKeys).forEach(([provider, key]) => {
        universalFlags[provider] = key === 'UNIVERSAL';
      });
      setUseUniversal(universalFlags);
    } catch (error) {
      console.error('Load keys error:', error);
      toast.error(error.response?.data?.detail || 'Failed to load API keys. Please login again.');
    }
  };

  const handleSaveKey = async (provider) => {
    setLoading(true);
    try {
      await axios.put(`${API}/keys`, {
        provider,
        api_key: keyInput,
        use_universal: false
      });
      toast.success('API key saved');
      setEditingKey(null);
      setKeyInput('');
      loadKeys();
    } catch (error) {
      toast.error('Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUniversal = async (provider, enabled) => {
    setLoading(true);
    try {
      await axios.put(`${API}/keys`, {
        provider,
        use_universal: enabled
      });
      toast.success(enabled ? 'Using universal key' : 'Universal key disabled');
      loadKeys();
    } catch (error) {
      toast.error('Failed to update key setting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/chat')}
            data-testid="back-to-chat-btn"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Settings
          </h1>
        </div>

        {/* Universal Key Info */}
        <Card className="mb-6 border-primary/20 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Universal Key
            </CardTitle>
            <CardDescription>
              Use the Emergent universal key for GPT, Claude, and Gemini models without providing your own API keys.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* API Keys */}
        <div className="space-y-4">
          {Object.entries(API_KEY_GUIDES).map(([provider, info]) => (
            <Card key={provider} className="border-border" data-testid={`api-key-card-${provider}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: info.color + '20', borderColor: info.color + '40' }}
                    >
                      <Lock className="h-5 w-5" style={{ color: info.color }} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{info.name}</CardTitle>
                      <CardDescription>
                        {keys[provider] && keys[provider] !== 'UNIVERSAL' ? (
                          <span className="text-xs font-mono">{keys[provider]}</span>
                        ) : useUniversal[provider] ? (
                          <span className="text-xs text-muted-foreground">Using universal key</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No key configured</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <a
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                    data-testid={`api-guide-link-${provider}`}
                  >
                    Get API Key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {info.universal && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <Label htmlFor={`universal-${provider}`} className="text-sm">
                      Use Universal Key (Emergent)
                    </Label>
                    <Switch
                      id={`universal-${provider}`}
                      checked={useUniversal[provider] || false}
                      onCheckedChange={(checked) => handleToggleUniversal(provider, checked)}
                      disabled={loading}
                      data-testid={`universal-switch-${provider}`}
                    />
                  </div>
                )}

                {!useUniversal[provider] && (
                  <>
                    {editingKey === provider ? (
                      <div className="space-y-2">
                        <Input
                          type="password"
                          placeholder="Enter your API key"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          className="font-mono text-sm"
                          data-testid={`api-key-input-${provider}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveKey(provider)}
                            disabled={loading || !keyInput}
                            data-testid={`save-key-btn-${provider}`}
                          >
                            Save Key
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingKey(null);
                              setKeyInput('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingKey(provider)}
                        data-testid={`edit-key-btn-${provider}`}
                      >
                        {keys[provider] && keys[provider] !== 'UNIVERSAL' ? 'Update Key' : 'Add Key'}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
