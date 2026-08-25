-- =============================================================================
-- 0003 — Marcacao de uso do token
--
-- O token e multiuso dentro da janela de validade (ADR-003). Registrar cada uso
-- e o que distingue "o cliente reabriu o link" de "estao varrendo tokens".
--
-- Precisa ser funcao, e nao update pelo cliente, por dois motivos:
--   1. o incremento tem que ser atomico — dois acessos simultaneos nao podem
--      contar como um;
--   2. e a unica escrita que a validacao faz, e mante-la aqui deixa a Edge
--      Function sem nenhum caminho de escrita direto na tabela de tokens.
--
-- Implementa: 03-spec.md §Validacao do token
-- Atende: FR-15, FR-18
-- =============================================================================

create or replace function public.portal_touch_token(p_token_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.portal_link_tokens
     set use_count    = use_count + 1,
         last_used_at = now()
   where id = p_token_id;
$$;

comment on function public.portal_touch_token(uuid) is
  'Marca uso do token de link: incrementa use_count e atualiza last_used_at.';

-- Somente service_role executa. O cliente nao tem caminho ate aqui: e
-- security definer, e deixar anon/authenticated executarem permitiria inflar
-- use_count de um token conhecido para atrapalhar a investigacao.
revoke all on function public.portal_touch_token(uuid) from public, anon, authenticated;
grant execute on function public.portal_touch_token(uuid) to service_role;
