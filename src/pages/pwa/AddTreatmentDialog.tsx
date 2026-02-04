import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Clock, Euro } from "lucide-react";

interface Treatment {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
}

interface AddTreatmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  hotelId: string;
  onTreatmentsAdded: () => void;
}

export const AddTreatmentDialog = ({
  open,
  onOpenChange,
  bookingId,
  hotelId,
  onTreatmentsAdded,
}: AddTreatmentDialogProps) => {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTreatments();
    }
  }, [open, hotelId]);

  const fetchTreatments = async () => {
    setLoading(true);
    try {
      // Fetch treatments for this hotel using the same RPC as client side
      const { data, error } = await supabase
        .rpc('get_public_treatments', { _hotel_id: hotelId });

      if (error) throw error;

      setTreatments(data || []);
    } catch (error) {
      console.error("Error fetching treatments:", error);
      toast.error("Erreur lors du chargement des prestations");
    } finally {
      setLoading(false);
    }
  };

  const toggleTreatment = (treatmentId: string) => {
    const newSelected = new Set(selectedTreatments);
    if (newSelected.has(treatmentId)) {
      newSelected.delete(treatmentId);
    } else {
      newSelected.add(treatmentId);
    }
    setSelectedTreatments(newSelected);
  };

  const calculateTotal = () => {
    return treatments
      .filter(t => selectedTreatments.has(t.id))
      .reduce((sum, t) => sum + (t.price || 0), 0);
  };

  const handleAddTreatments = async () => {
    if (selectedTreatments.size === 0) {
      toast.error("Veuillez sélectionner au moins une prestation");
      return;
    }

    setSaving(true);
    try {
      // Insert new booking treatments
      const newTreatments = Array.from(selectedTreatments).map(treatmentId => ({
        booking_id: bookingId,
        treatment_id: treatmentId,
      }));

      const { error: insertError } = await supabase
        .from("booking_treatments")
        .insert(newTreatments);

      if (insertError) throw insertError;

      // Get current booking total and calculate new total
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("total_price")
        .eq("id", bookingId)
        .single();

      if (bookingError) throw bookingError;

      const currentTotal = bookingData?.total_price || 0;
      const addedTotal = calculateTotal();
      const newTotal = Number(currentTotal) + Number(addedTotal);

      // Update booking total price
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ total_price: newTotal })
        .eq("id", bookingId);

      if (updateError) throw updateError;

      toast.success(`${selectedTreatments.size} prestation(s) ajoutée(s)`);
      setSelectedTreatments(new Set());
      onOpenChange(false);
      onTreatmentsAdded();
    } catch (error) {
      console.error("Error adding treatments:", error);
      toast.error("Erreur lors de l'ajout des prestations");
    } finally {
      setSaving(false);
    }
  };

  // Group treatments by category
  const groupedTreatments = treatments.reduce((acc, treatment) => {
    const category = treatment.category || "Autres";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(treatment);
    return acc;
  }, {} as Record<string, Treatment[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Ajouter des prestations</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Chargement...
          </div>
        ) : treatments.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Aucune prestation disponible
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedTreatments).map(([category, categoryTreatments]) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      {category}
                    </h3>
                    <div className="space-y-3">
                      {categoryTreatments.map((treatment) => (
                        <div
                          key={treatment.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            selectedTreatments.has(treatment.id)
                              ? "border-black bg-gray-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          onClick={() => toggleTreatment(treatment.id)}
                        >
                          <Checkbox
                            checked={selectedTreatments.has(treatment.id)}
                            onCheckedChange={() => toggleTreatment(treatment.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-sm text-gray-900">
                                  {treatment.name}
                                </p>
                                {treatment.description && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {treatment.description}
                                  </p>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-gray-900 flex items-center gap-0.5 flex-shrink-0">
                                {treatment.price}
                                <Euro className="h-3 w-3" />
                              </p>
                            </div>
                            {treatment.duration && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                                <Clock className="h-3 w-3" />
                                {treatment.duration} min
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {selectedTreatments.size > 0 && (
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {selectedTreatments.size} prestation{selectedTreatments.size > 1 ? "s" : ""} sélectionnée{selectedTreatments.size > 1 ? "s" : ""}
                  </span>
                  <span className="font-semibold text-gray-900 flex items-center gap-1">
                    +{calculateTotal().toFixed(2)}
                    <Euro className="h-4 w-4" />
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            onClick={handleAddTreatments}
            disabled={selectedTreatments.size === 0 || saving}
          >
            {saving ? "Ajout..." : `Ajouter (${selectedTreatments.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
