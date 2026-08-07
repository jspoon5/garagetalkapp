import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vehicle } from "@shared/schema";
import { vehicleTypes, fuelTypes } from "@shared/schema";
import { 
  Car, Truck, Plus, Star, Trash2, Edit, 
  Bike, Plane, Battery, Fuel
} from "lucide-react";

const vehicleFormSchema = z.object({
  nickname: z.string().optional(),
  vehicleType: z.enum(vehicleTypes),
  fuelType: z.enum(fuelTypes),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.preprocess(
    (val) => (val === "" || val === undefined || val === null) ? undefined : Number(val),
    z.number().min(1900, "Year must be 1900 or later").max(2100, "Year must be 2100 or earlier").optional()
  ),
  trim: z.string().optional(),
  vin: z.string().optional(),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

type VehicleFormData = z.infer<typeof vehicleFormSchema>;

const vehicleTypeLabels: Record<string, string> = {
  car: "Car",
  truck: "Truck",
  suv: "SUV",
  van: "Van",
  motorcycle: "Motorcycle",
  atv: "ATV",
  boat: "Boat",
  plane: "Plane",
  helicopter: "Helicopter",
  personal_flying_vehicle: "Personal Flying Vehicle",
  personal_drone: "Personal Drone",
  commercial_drone: "Commercial Drone",
  project_vehicle: "Project Vehicle",
  other: "Other",
};

const fuelTypeLabels: Record<string, string> = {
  gasoline: "Gasoline",
  diesel: "Diesel",
  hybrid: "Hybrid",
  plug_in_hybrid: "Plug-in Hybrid",
  battery_electric: "Battery Electric",
  hydrogen: "Hydrogen",
  propane: "Propane",
  natural_gas: "Natural Gas",
  aviation_fuel: "Aviation Fuel",
  other: "Other",
};

function getVehicleIcon(vehicleType: string) {
  switch (vehicleType) {
    case "car":
    case "suv":
    case "van":
      return <Car className="h-6 w-6" />;
    case "truck":
      return <Truck className="h-6 w-6" />;
    case "motorcycle":
    case "atv":
      return <Bike className="h-6 w-6" />;
    case "plane":
    case "helicopter":
    case "personal_flying_vehicle":
    case "personal_drone":
    case "commercial_drone":
      return <Plane className="h-6 w-6" />;
    default:
      return <Car className="h-6 w-6" />;
  }
}

function getFuelIcon(fuelType: string) {
  if (fuelType === "battery_electric" || fuelType === "hydrogen") {
    return <Battery className="h-3 w-3" />;
  }
  return <Fuel className="h-3 w-3" />;
}

export default function MyGarage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const { toast } = useToast();

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      nickname: "",
      vehicleType: "car",
      fuelType: "gasoline",
      make: "",
      model: "",
      year: undefined,
      trim: "",
      vin: "",
      notes: "",
      isPrimary: false,
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (data: VehicleFormData) => {
      return apiRequest("POST", "/api/vehicles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Vehicle added to your garage!" });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add vehicle", variant: "destructive" });
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VehicleFormData> }) => {
      return apiRequest("PATCH", `/api/vehicles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Vehicle updated!" });
      setEditVehicle(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update vehicle", variant: "destructive" });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/vehicles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Vehicle removed from garage" });
    },
    onError: () => {
      toast({ title: "Failed to delete vehicle", variant: "destructive" });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/vehicles/${id}/primary`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Primary vehicle updated" });
    },
    onError: () => {
      toast({ title: "Failed to set primary vehicle", variant: "destructive" });
    },
  });

  const onSubmit = (data: VehicleFormData) => {
    if (editVehicle) {
      updateVehicleMutation.mutate({ id: editVehicle.id, data });
    } else {
      createVehicleMutation.mutate(data);
    }
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditVehicle(vehicle);
    form.reset({
      nickname: vehicle.nickname || "",
      vehicleType: vehicle.vehicleType as any,
      fuelType: vehicle.fuelType as any,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year || undefined,
      trim: vehicle.trim || "",
      vin: vehicle.vin || "",
      notes: vehicle.notes || "",
      isPrimary: vehicle.isPrimary || false,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to remove this vehicle from your garage?")) {
      deleteVehicleMutation.mutate(id);
    }
  };

  const handleCloseDialog = () => {
    setAddDialogOpen(false);
    setEditVehicle(null);
    form.reset();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          <h2 className="text-xl font-semibold">My Garage</h2>
          <span className="text-sm text-muted-foreground">({vehicles.length})</span>
        </div>
        <Dialog open={addDialogOpen || !!editVehicle} onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setAddDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-vehicle">
              <Plus className="h-4 w-4 mr-1" />
              Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editVehicle ? "Edit Vehicle" : "Add Vehicle to Garage"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nickname (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="My Daily Driver" {...field} data-testid="input-vehicle-nickname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vehicle-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vehicleTypes.map((type) => (
                              <SelectItem key={type} value={type}>{vehicleTypeLabels[type]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="fuelType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuel/Power Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-fuel-type">
                              <SelectValue placeholder="Select fuel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fuelTypes.map((type) => (
                              <SelectItem key={type} value={type}>{fuelTypeLabels[type]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="make"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make</FormLabel>
                        <FormControl>
                          <Input placeholder="Toyota" {...field} data-testid="input-vehicle-make" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl>
                          <Input placeholder="Camry" {...field} data-testid="input-vehicle-model" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="2022" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value || ""}
                            data-testid="input-vehicle-year"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="trim"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trim (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="SE, XLE, etc." {...field} data-testid="input-vehicle-trim" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="vin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VIN (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="1HGBH41JXMN109186" {...field} data-testid="input-vehicle-vin" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Any special notes about this vehicle..." 
                          {...field} 
                          data-testid="input-vehicle-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createVehicleMutation.isPending || updateVehicleMutation.isPending}
                    data-testid="button-save-vehicle"
                  >
                    {createVehicleMutation.isPending || updateVehicleMutation.isPending 
                      ? "Saving..." 
                      : editVehicle ? "Update" : "Add Vehicle"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : vehicles.length > 0 ? (
        <div className="space-y-3" data-testid="vehicles-list">
          {vehicles.map((vehicle) => (
            <div 
              key={vehicle.id} 
              className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover-elevate"
              data-testid={`vehicle-card-${vehicle.id}`}
            >
              <div className="h-12 w-12 rounded-lg bg-background flex items-center justify-center">
                {getVehicleIcon(vehicle.vehicleType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium">
                    {vehicle.nickname || `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}`.trim()}
                  </h3>
                  {vehicle.isPrimary && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3" />
                      Primary
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    {getFuelIcon(vehicle.fuelType)}
                    {fuelTypeLabels[vehicle.fuelType]}
                  </Badge>
                </div>
                {vehicle.nickname && (
                  <p className="text-sm text-muted-foreground">
                    {vehicle.year ? `${vehicle.year} ` : ""}{vehicle.make} {vehicle.model} {vehicle.trim || ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {vehicleTypeLabels[vehicle.vehicleType]}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!vehicle.isPrimary && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setPrimaryMutation.mutate(vehicle.id)}
                    disabled={setPrimaryMutation.isPending}
                    title="Set as primary vehicle"
                    data-testid={`button-set-primary-${vehicle.id}`}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleEdit(vehicle)}
                  data-testid={`button-edit-vehicle-${vehicle.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(vehicle.id)}
                  disabled={deleteVehicleMutation.isPending}
                  data-testid={`button-delete-vehicle-${vehicle.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8" data-testid="empty-garage">
          <Car className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">
            No vehicles in your garage yet. Add your cars, trucks, bikes, planes, or drones!
          </p>
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-first-vehicle">
            <Plus className="h-4 w-4 mr-1" />
            Add Your First Vehicle
          </Button>
        </div>
      )}
    </Card>
  );
}
