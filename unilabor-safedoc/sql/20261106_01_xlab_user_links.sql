-- =============================================================================
-- Vinculo 1 a 1 entre usuarios de DocSafe y usuarios de XLab (public.usuarios del
-- LIS, en la BD `xlab`). Con el, cada colaborador ve en DocSafe sus notificaciones
-- de Contigo+ (contigo.staff_notifications). RH lo administra desde la ficha del
-- colaborador; la identidad siempre se resuelve JWT -> user_id -> cve_usuario.
--
-- Sin FK hacia public.usuarios: viven en bases de datos distintas. Una cuenta de
-- DocSafe tiene a lo mas un usuario de XLab y viceversa (ambas columnas son unicas).
--
-- Aditivo e idempotente; compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.xlab_user_links (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  cve_usuario INTEGER NOT NULL,
  linked_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_xlab_user_links_cve_usuario UNIQUE (cve_usuario)
);

COMMIT;
