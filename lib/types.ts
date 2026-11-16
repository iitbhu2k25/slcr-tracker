export interface User {
  id: number;
  username: string;
  password_hash: string;
  pw_version: number;
  role: "admin" | "staff";
  name: string;
  designation: string;
  emp_code: string;
  joined_on: string;
  email: string;
  phone: string;
  has_photo: boolean;
  photo_version: number;
  active: boolean;
  must_change_pw: boolean;
  created_at: Date;
  last_login: Date | null;
}

/** A user without secrets, safe to pass to client components. */
export type PublicUser = Omit<User, "password_hash" | "pw_version">;

export interface Entry {
  id: number;
  user_id: number;
  date: string;
  hours: number;
  location: string;
  category: string;
  status: string;
  title: string;
  work: string;
  outputs: string;
  next_plan: string;
  issues: string;
  created_at: Date;
  updated_at: Date;
  review_status: "" | "reviewed" | "revision";
  review_remark: string;
  reviewed_at: Date | null;
  reviewed_by: number | null;
}
