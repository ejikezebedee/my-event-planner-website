import type { z } from "zod";
import type {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "@mep/validation";

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
