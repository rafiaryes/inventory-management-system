import { t } from "elysia";
import { createSuccessSchema } from "../../common/http";

export const loginBodySchema = t.Object(
  {
    email: t.String({
      minLength: 1,
      maxLength: 255,
      format: "email",
      description: "Email pengguna terdaftar",
    }),
    password: t.String({
      minLength: 8,
      maxLength: 128,
      description: "Kata sandi pengguna (8-128 karakter)",
    }),
  },
  { additionalProperties: false },
);

export const authenticatedUserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
  email: t.String({ format: "email" }),
  role: t.Union([t.Literal("admin"), t.Literal("staff")]),
});

export const authUserDataSchema = t.Object({
  user: authenticatedUserSchema,
});

export const loginSuccessResponseSchema =
  createSuccessSchema(authUserDataSchema);

export const authMeSuccessResponseSchema =
  createSuccessSchema(authUserDataSchema);

export const logoutSuccessResponseSchema = createSuccessSchema(t.Null());
