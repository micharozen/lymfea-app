import Despia from 'despia-native';

// Initialize Despia SDK
let despiaInstance: typeof Despia | null = null;

export const initializeDespia = () => {
  if (despiaInstance) return despiaInstance;
  
  despiaInstance = Despia;
  console.log('[Despia] SDK initialized');
  return despiaInstance;
};

// Register user for push notifications
export const registerForPushNotifications = async (userId: string) => {
  try {
    const despia = initializeDespia();
    
    // Request notification permissions
    const permission = await despia.requestPermissions();
    
    if (permission.granted) {
      // Register device for push notifications
      await despia.register({
        userId,
        onRegistered: (token) => {
          console.log('[Despia] Push token registered:', token);
        },
        onNotificationReceived: (notification) => {
          console.log('[Despia] Notification received:', notification);
        },
      });
      
      console.log('[Despia] User registered for notifications:', userId);
      return true;
    } else {
      console.warn('[Despia] Notification permission denied');
      return false;
    }
  } catch (error) {
    console.error('[Despia] Registration error:', error);
    return false;
  }
};

// Unregister from push notifications
export const unregisterFromPushNotifications = async () => {
  try {
    const despia = initializeDespia();
    await despia.unregister();
    console.log('[Despia] User unregistered from notifications');
  } catch (error) {
    console.error('[Despia] Unregister error:', error);
  }
};
