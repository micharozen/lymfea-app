import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isDespia, registerForPush } from "@/lib/despia";
import { toast } from "sonner";

interface PushToken {
  id: string;
  user_id: string;
  token: string;
  endpoint: string;
  created_at: string;
  updated_at: string;
}

const PwaDespiaDiagnostic = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingRegistration, setTestingRegistration] = useState(false);
  
  const isDespiaEnv = isDespia();
  const urlParams = new URLSearchParams(window.location.search);
  const hasTokenInUrl = urlParams.has('push_token') || urlParams.has('onesignal_id');

  useEffect(() => {
    loadDiagnosticData();
  }, []);

  const loadDiagnosticData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await fetchPushTokens(user.id);
      }
    } catch (error) {
      console.error('[Diagnostic] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPushTokens = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPushTokens(data || []);
    } catch (error) {
      console.error('[Diagnostic] Error fetching tokens:', error);
    }
  };

  const handleTestRegistration = () => {
    setTestingRegistration(true);
    const success = registerForPush();
    
    if (success) {
      toast.success("Demande envoyée à Despia");
      setTimeout(() => {
        toast.info("Despia devrait maintenant afficher la popup de permission");
      }, 1000);
    } else {
      toast.error("Pas dans l'environnement Despia");
    }
    
    setTimeout(() => setTestingRegistration(false), 2000);
  };

  const handleSimulateReturn = () => {
    const simulatedToken = `despia_test_${Date.now()}`;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('push_token', simulatedToken);
    
    toast.info("Simulation du retour Despia...");
    setTimeout(() => {
      window.location.href = currentUrl.toString();
    }, 500);
  };

  const StatusIndicator = ({ condition, label }: { condition: boolean; label: string }) => (
    <div className="flex items-center justify-between py-2 border-b">
      <span className="text-sm">{label}</span>
      {condition ? (
        <CheckCircle2 className="h-5 w-5 text-green-600" />
      ) : (
        <XCircle className="h-5 w-5 text-red-600" />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/profile")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Diagnostic Despia</h1>
            <p className="text-xs text-gray-500">Test notifications push natives</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Environment Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Environnement</CardTitle>
            <CardDescription>Statut de l'environnement Despia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Type d'environnement</span>
              <Badge variant={isDespiaEnv ? "default" : "secondary"}>
                {isDespiaEnv ? "🚀 Despia Native" : "🌐 Web Standard"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">User Agent</span>
              <span className="text-xs text-gray-500 max-w-[200px] truncate">
                {navigator.userAgent}
              </span>
            </div>
            <StatusIndicator 
              condition={isDespiaEnv} 
              label="Despia détecté" 
            />
            <StatusIndicator 
              condition={hasTokenInUrl} 
              label="Token dans l'URL" 
            />
          </CardContent>
        </Card>

        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Chargement...</div>
            ) : userId ? (
              <div className="text-xs font-mono bg-gray-100 p-2 rounded break-all">
                {userId}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Non connecté</div>
            )}
          </CardContent>
        </Card>

        {/* Push Tokens */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tokens Push Enregistrés</CardTitle>
            <CardDescription>
              Tokens sauvegardés dans push_tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Chargement...</div>
            ) : pushTokens.length > 0 ? (
              <div className="space-y-3">
                {pushTokens.map((token) => (
                  <div key={token.id} className="bg-gray-50 p-3 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{token.endpoint}</Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(token.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs font-mono bg-white p-2 rounded break-all border">
                      {token.token}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Aucun token enregistré</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions de Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleTestRegistration}
              disabled={testingRegistration || !isDespiaEnv}
              className="w-full"
            >
              {testingRegistration ? "Envoi en cours..." : "🔔 Tester registerForPush()"}
            </Button>
            
            <Button
              onClick={handleSimulateReturn}
              variant="outline"
              className="w-full"
            >
              🔄 Simuler retour avec token
            </Button>

            <Button
              onClick={loadDiagnosticData}
              variant="outline"
              className="w-full"
            >
              ♻️ Rafraîchir les données
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions de Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">1. Dans Despia :</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                <li>Cliquer "Tester registerForPush()"</li>
                <li>Popup native devrait apparaître</li>
                <li>Accepter les notifications</li>
                <li>Page se recharge avec token dans l'URL</li>
              </ul>
            </div>
            
            <div className="space-y-1">
              <p className="font-medium">2. Hors Despia (simulation) :</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                <li>Cliquer "Simuler retour avec token"</li>
                <li>Vérifie que le hook capture le token</li>
                <li>Vérifie la sauvegarde en base</li>
              </ul>
            </div>

            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> Pour tester dans Despia, ouvrez cette page dans l'app Despia wrapper. 
                Le User Agent doit contenir "Despia".
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PwaDespiaDiagnostic;
