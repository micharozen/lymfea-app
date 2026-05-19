import { UseFormReturn, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface CancellationTiersEditorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  disabled?: boolean;
}

export function CancellationTiersEditor({ form, disabled }: CancellationTiersEditorProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cancellation_tiers",
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ex. entre 24 h et 12 h avant le RDV : 50 % remboursé si la tranche couvre 24 h–12 h.
      </p>
      {fields.map((field, index) => (
        <div key={field.id} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
          <FormField
            control={form.control}
            name={`cancellation_tiers.${index}.max_hours`}
            render={({ field: f }) => (
              <FormItem className="col-span-3">
                <FormLabel className="text-xs">De (h)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    {...f}
                    value={String(f.value ?? "")}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`cancellation_tiers.${index}.min_hours`}
            render={({ field: f }) => (
              <FormItem className="col-span-3">
                <FormLabel className="text-xs">A (h)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    {...f}
                    value={String(f.value ?? "")}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`cancellation_tiers.${index}.refund_percent`}
            render={({ field: f }) => (
              <FormItem className="col-span-4">
                <FormLabel className="text-xs">Remboursement %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    {...f}
                    value={String(f.value ?? "")}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="col-span-2 text-destructive"
            disabled={disabled}
            onClick={() => remove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => append({ max_hours: 24, min_hours: 12, refund_percent: 50 })}
      >
        <Plus className="h-4 w-4 mr-1" />
        Ajouter une tranche
      </Button>
      <FormMessage>{form.formState.errors.cancellation_tiers?.message as string}</FormMessage>
    </div>
  );
}
