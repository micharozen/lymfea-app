import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateBookingDialog from "@/components/booking/CreateBookingDialog";
import PwaHeader from "@/components/pwa/Header";

export default function AdminPwaCreateBooking() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      navigate("/admin-pwa/dashboard");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <PwaHeader
        title="Nouvelle réservation"
        showBack
        onBack={() => navigate("/admin-pwa/dashboard")}
      />

      <CreateBookingDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        selectedDate={new Date()}
      />
    </div>
  );
}
