import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const RateHairdresser = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingData, setRatingData] = useState<{
    id: string;
    hairdresser_name: string;
    hotel_name: string;
  } | null>(null);

  useEffect(() => {
    fetchRatingData();
  }, [token]);

  const fetchRatingData = async () => {
    try {
      if (!token) {
        toast.error("Invalid rating link");
        return;
      }

      // Fetch rating record with booking details
      const { data, error } = await supabase
        .from("hairdresser_ratings")
        .select(`
          id,
          rating,
          comment,
          bookings (
            hairdresser_name,
            hotel_name
          )
        `)
        .eq("rating_token", token)
        .single();

      if (error || !data) {
        toast.error("Rating link is invalid or expired");
        return;
      }

      // Check if already rated (has comment)
      if (data.comment) {
        setSubmitted(true);
      }

      setRatingData({
        id: data.id,
        hairdresser_name: (data.bookings as any)?.hairdresser_name || "your hairdresser",
        hotel_name: (data.bookings as any)?.hotel_name || "the hotel",
      });
      setRating(data.rating || 0);
    } catch (error) {
      console.error("Error fetching rating:", error);
      toast.error("Error loading rating page");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!ratingData || rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("hairdresser_ratings")
        .update({
          rating,
          comment: comment.trim() || null,
        })
        .eq("id", ratingData.id);

      if (error) throw error;

      setSubmitted(true);
      toast.success("Thank you for your feedback!");
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast.error("Error submitting rating");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!ratingData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <h1 className="text-xl font-semibold text-foreground mb-2">Invalid Link</h1>
        <p className="text-muted-foreground text-center">
          This rating link is invalid or has expired.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <Star className="w-8 h-8 text-green-600 fill-green-600" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Thank you!</h1>
        <p className="text-muted-foreground text-center">
          Your feedback has been submitted successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-md mx-auto pt-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Rate your experience
          </h1>
          <p className="text-muted-foreground">
            How was your service with <strong>{ratingData.hairdresser_name}</strong> at{" "}
            <strong>{ratingData.hotel_name}</strong>?
          </p>
        </div>

        {/* Star Rating */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="p-1 transition-transform hover:scale-110 active:scale-95"
            >
              <Star
                className={`w-10 h-10 transition-colors ${
                  star <= (hoveredRating || rating)
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Rating Label */}
        <div className="text-center mb-8">
          <span className="text-sm text-muted-foreground">
            {rating === 1 && "Poor"}
            {rating === 2 && "Fair"}
            {rating === 3 && "Good"}
            {rating === 4 && "Very Good"}
            {rating === 5 && "Excellent"}
          </span>
        </div>

        {/* Comment */}
        <div className="mb-8">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Leave a comment (optional)
          </label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us about your experience..."
            className="resize-none"
            rows={4}
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full rounded-full h-12"
        >
          {submitting ? "Submitting..." : "Submit Rating"}
        </Button>
      </div>
    </div>
  );
};

export default RateHairdresser;
