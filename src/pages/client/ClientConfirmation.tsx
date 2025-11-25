import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export default function ClientConfirmation() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();

  // Ultra simple version - no async, no effects
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success Checkmark */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="relative bg-green-500/10 rounded-full p-6">
              <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        
        {/* Success Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Your booking is completed.
          </h1>
          
          <p className="text-gray-600 leading-relaxed px-4">
            You will receive a message by WhatsApp and email for updates and confirmation
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-8">
          <Button
            onClick={() => navigate(`/client/${hotelId}`)}
            className="w-full h-14 text-base bg-black text-white hover:bg-gray-800"
            size="lg"
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
