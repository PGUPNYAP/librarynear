"use client";

import { useState, useTransition } from "react";
import { Star, X } from "lucide-react";
import { submitReview } from "@/app/actions/submit-review";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";

export function ReviewModal({
  isOpen,
  onClose,
  libraryBranchId,
}: {
  isOpen: boolean;
  onClose: () => void;
  libraryBranchId: string;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }
    if (reviewText.trim().length < 10) {
      setError("Please write at least 10 characters.");
      return;
    }

    startTransition(async () => {
      const res = await submitReview(libraryBranchId, rating, reviewText, pathname);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
        // Reset state so it's fresh if opened again
        setRating(0);
        setReviewText("");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Write a Review</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg font-medium">{error}</div>}
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Review</label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell others about your experience..."
              rows={4}
              maxLength={2000}
              aria-label="Your review"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
              disabled={isPending}
            />
            <p className="text-right text-xs text-gray-400">{reviewText.length}/2000</p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" className="rounded-full font-medium" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full font-medium shadow-md shadow-primary/20" disabled={isPending}>
              {isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
