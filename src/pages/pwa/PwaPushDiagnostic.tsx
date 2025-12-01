import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DiagnosticResult {
  name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

const PwaPushDiagnostic = () => {
  const navigate = useNavigate();
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostic = async () => {
    setIsRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // 1. Check browser support
    if (!('Notification' in window)) {
      diagnostics.push({
        name: 'Support navigateur',
        status: 'error',
        message: 'Les notifications ne sont pas supportées',
        details: 'Votre navigateur ne supporte pas les notifications push'
      });
    } else {
      diagnostics.push({
        name: 'Support navigateur',
        status: 'success',
        message: 'Notifications supportées'
      });
    }

    // 2. Check service worker
    if (!('serviceWorker' in navigator)) {
      diagnostics.push({
        name: 'Service Worker',
        status: 'error',
        message: 'Service Worker non supporté',
        details: 'Les service workers ne sont pas disponibles'
      });
    } else {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          diagnostics.push({
            name: 'Service Worker',
            status: 'success',
            message: 'Service Worker enregistré',
            details: `Scope: ${registration.scope}`
          });
        } else {
          diagnostics.push({
            name: 'Service Worker',
            status: 'warning',
            message: 'Service Worker non enregistré',
            details: 'Le service worker doit être enregistré pour les notifications'
          });
        }
      } catch (error) {
        diagnostics.push({
          name: 'Service Worker',
          status: 'error',
          message: 'Erreur lors de la vérification',
          details: error instanceof Error ? error.message : 'Erreur inconnue'
        });
      }
    }

    // 3. Check permission
    const permission = Notification.permission;
    if (permission === 'granted') {
      diagnostics.push({
        name: 'Permission',
        status: 'success',
        message: 'Permission accordée'
      });
    } else if (permission === 'denied') {
      diagnostics.push({
        name: 'Permission',
        status: 'error',
        message: 'Permission refusée',
        details: 'Vous devez autoriser les notifications dans les paramètres du navigateur'
      });
    } else {
      diagnostics.push({
        name: 'Permission',
        status: 'warning',
        message: 'Permission non demandée',
        details: 'Activez le toggle des notifications pour autoriser'
      });
    }

    // 4. Check push subscription
    if ('serviceWorker' in navigator && permission === 'granted') {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          diagnostics.push({
            name: 'Subscription Push',
            status: 'success',
            message: 'Abonné aux notifications',
            details: `Endpoint: ${subscription.endpoint.substring(0, 50)}...`
          });
        } else {
          diagnostics.push({
            name: 'Subscription Push',
            status: 'warning',
            message: 'Non abonné',
            details: 'Activez les notifications pour créer un abonnement'
          });
        }
      } catch (error) {
        diagnostics.push({
          name: 'Subscription Push',
          status: 'error',
          message: 'Erreur lors de la vérification',
          details: error instanceof Error ? error.message : 'Erreur inconnue'
        });
      }
    }

    // 5. Check database token
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: tokens, error } = await supabase
          .from('push_tokens')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        if (tokens && tokens.length > 0) {
          diagnostics.push({
            name: 'Token en base',
            status: 'success',
            message: `${tokens.length} token(s) enregistré(s)`,
            details: `Dernière mise à jour: ${new Date(tokens[0].updated_at).toLocaleString('fr-FR')}`
          });
        } else {
          diagnostics.push({
            name: 'Token en base',
            status: 'warning',
            message: 'Aucun token enregistré',
            details: 'Activez les notifications pour créer un token'
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        name: 'Token en base',
        status: 'error',
        message: 'Erreur lors de la vérification',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }

    // 6. Check VAPID keys
    try {
      const { data, error } = await supabase.functions.invoke('get-vapid-public-key');
      
      if (error) throw error;
      
      if (data?.publicKey) {
        diagnostics.push({
          name: 'Clés VAPID',
          status: 'success',
          message: 'Clés configurées',
          details: `Clé publique: ${data.publicKey.substring(0, 30)}...`
        });
      } else {
        diagnostics.push({
          name: 'Clés VAPID',
          status: 'error',
          message: 'Clés non configurées'
        });
      }
    } catch (error) {
      diagnostics.push({
        name: 'Clés VAPID',
        status: 'error',
        message: 'Erreur lors de la vérification',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }

    setResults(diagnostics);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  const getStatusIcon = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/profile")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Diagnostic Push</h1>
            <p className="text-xs text-muted-foreground">
              Vérification de la configuration
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runDiagnostic}
            disabled={isRunning}
          >
            {isRunning ? 'En cours...' : 'Relancer'}
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="p-4 space-y-3">
        {results.map((result, index) => (
          <Card key={index} className={`border ${getStatusColor(result.status)}`}>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start gap-3">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <CardTitle className="text-base">{result.name}</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    {result.message}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            {result.details && (
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded">
                  {result.details}
                </p>
              </CardContent>
            )}
          </Card>
        ))}

        {results.length === 0 && isRunning && (
          <div className="text-center py-8 text-muted-foreground">
            Analyse en cours...
          </div>
        )}
      </div>

      {/* Summary */}
      {results.length > 0 && !isRunning && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
          <div className="flex items-center justify-around text-center">
            <div>
              <div className="text-2xl font-bold text-green-500">
                {results.filter(r => r.status === 'success').length}
              </div>
              <div className="text-xs text-muted-foreground">OK</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">
                {results.filter(r => r.status === 'warning').length}
              </div>
              <div className="text-xs text-muted-foreground">Avertissements</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">
                {results.filter(r => r.status === 'error').length}
              </div>
              <div className="text-xs text-muted-foreground">Erreurs</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PwaPushDiagnostic;
