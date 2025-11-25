import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import oomLogo from '@/assets/oom-monogram-white.svg';
import welcomeBg from '@/assets/welcome-bg.png';

export default function ClientWelcome() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();

  const { data: hotel, isLoading } = useQuery({
    queryKey: ['hotel', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Hotel not found</h1>
          <p className="text-muted-foreground">Please check your QR code</p>
        </div>
      </div>
    );
  }

  const backgroundImage = hotel.cover_image || hotel.image || welcomeBg;

  return (
    <div 
      className="min-h-screen bg-cover bg-center relative flex flex-col"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between p-6 text-center">
        {/* Logo */}
        <div className="pt-12">
          <img src={oomLogo} alt="OOM" className="h-20 w-20 mx-auto mb-8" />
          <h1 className="text-white text-4xl font-kormelink mb-2">
            {hotel.name}
          </h1>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center max-w-md">
          <h2 className="text-white text-3xl font-semibold mb-4">
            Beauty Room Service
          </h2>
          <p className="text-white/90 text-lg mb-12 leading-relaxed">
            Professional beauty treatments delivered to your room. 
            Select your services and book your perfect moment.
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full max-w-md space-y-4 pb-12">
          <Button
            onClick={() => navigate(`/client/${hotelId}/menu?gender=women`)}
            className="w-full h-14 text-lg bg-white text-primary hover:bg-white/90"
          >
            Women's Menu
          </Button>
          <Button
            onClick={() => navigate(`/client/${hotelId}/menu?gender=men`)}
            variant="outline"
            className="w-full h-14 text-lg bg-transparent border-2 border-white text-white hover:bg-white/10"
          >
            Men's Menu
          </Button>
        </div>
      </div>
    </div>
  );
}
