export interface Clinic {
  id: string;
  name: string;
  unit_name?: string | null;
  address?: string;
  phone?: string;
  cnpj?: string;
}

export interface AppointmentWithClinic {
  id: string;
  date: string;
  time: string;
  professional: string;
  procedure: string;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  notes?: string;
  clinic: Clinic;
}
