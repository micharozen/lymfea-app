import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function PwaTestNotifications() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-push-notifications');

      if (error) throw error;

      setResult(data);
      toast.success('Test réussi ! Vérifiez vos notifications push.');
    } catch (error) {
      console.error('Test error:', error);
      toast.error('Erreur lors du test');
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6 pt-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Test Notifications Push</h1>
          <p className="text-muted-foreground">
            Testez le système de notifications push en créant une réservation de test
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Lancer le test
            </CardTitle>
            <CardDescription>
              Cette action va créer des données de test et envoyer une notification push
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runTest} 
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Test en cours...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 mr-2" />
                  Créer une réservation de test
                </>
              )}
            </Button>

            {result && (
              <div className={`mt-4 p-4 rounded-lg ${
                result.error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'
              }`}>
                {result.error ? (
                  <>
                    <div className="flex items-center gap-2 font-semibold mb-2">
                      <AlertCircle className="w-5 h-5" />
                      Erreur
                    </div>
                    <p className="text-sm">{result.error}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 font-semibold mb-3">
                      <CheckCircle2 className="w-5 h-5" />
                      Test réussi !
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>Réservation créée:</strong>
                        <ul className="ml-4 mt-1 space-y-1">
                          <li>• ID: {result.booking?.booking_id}</li>
                          <li>• Client: {result.booking?.client_name}</li>
                          <li>• Hôtel: {result.booking?.hotel_name}</li>
                          <li>• Date: {result.booking?.date} à {result.booking?.time}</li>
                        </ul>
                      </div>
                      <div className="mt-3 pt-3 border-t border-green-500/20">
                        <strong>Pour tester les notifications:</strong>
                        <ul className="ml-4 mt-1 space-y-1">
                          <li>• Email: {result.hairdresser?.email}</li>
                          <li>• Téléphone: {result.hairdresser?.phone}</li>
                          <li>• Mot de passe: Test123456!</li>
                        </ul>
                        <p className="mt-2 text-xs opacity-80">
                          {result.hairdresser?.message}
                        </p>
                      </div>
                      {result.notifications && (
                        <div className="mt-3 pt-3 border-t border-green-500/20">
                          <strong>Notifications envoyées:</strong>
                          <p className="ml-4 mt-1">
                            {result.notifications.success} notification(s) envoyée(s)
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-2 pt-4 border-t">
              <p><strong>Ce test va:</strong></p>
              <ul className="space-y-1 ml-4">
                <li>• Créer un hôtel de test si nécessaire</li>
                <li>• Créer un compte coiffeur de test avec les infos ci-dessus</li>
                <li>• Créer un menu de traitement</li>
                <li>• Créer une réservation "En attente"</li>
                <li>• Déclencher l'envoi de notifications push</li>
              </ul>
              <p className="mt-3">
                <strong>Pour vérifier:</strong>
              </p>
              <ul className="space-y-1 ml-4">
                <li>• Connectez-vous avec le compte coiffeur</li>
                <li>• Activez les notifications push si demandé</li>
                <li>• Vous devriez recevoir une notification</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
