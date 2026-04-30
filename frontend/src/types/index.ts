export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  timezone: string;
  notification_hour: number;
  units: string;
  onboarding_complete: boolean;
}

export interface Goal {
  id: string;
  goal_type: string;
  sport: string | null;
  title: string;
  description: string | null;
  target_date: string | null;
  target_value: Record<string, unknown> | null;
  priority: number;
  status: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface PlannedWorkout {
  id: string;
  scheduled_date: string;
  sport: string;
  workout_type: string;
  title: string;
  description: string;
  target_metrics: Record<string, unknown> | null;
  week_number: number | null;
  day_of_week: number | null;
  completed: boolean;
  matched_activity_id: string | null;
}

export interface TrainingPlan {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  phase: string | null;
  status: string;
  workouts: PlannedWorkout[];
}

export interface Message {
  id: string;
  channel: string;
  direction: string;
  role: string;
  content: string;
  created_at: string;
}
