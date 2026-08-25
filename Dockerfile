# Build multi-stage: Node compila, nginx serve.
#
# A imagem final NAO tem runtime Node. Num produto cuja proposta e seguranca de
# acesso, servir arquivos estaticos em vez de executar codigo no servidor e ganho
# direto: menos superficie e nada para atualizar por CVE de runtime (ADR-006).

# ---------- build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Camada de dependencias separada: so reinstala quando o manifesto muda.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Valores publicaveis, embutidos no bundle em tempo de build. Passe os seus com
#   docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=...
# NUNCA passe segredo por aqui: tudo com prefixo VITE_ vai para o bundle e e
# publico. Segredo vive nas Edge Functions.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# Ultima barreira antes de a imagem existir. Se um segredo escapou para o
# bundle, o build para aqui — nao no deploy.
RUN node scripts/check-bundle.mjs

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/snippets
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security.conf /etc/nginx/snippets/portal-security.conf
COPY --from=build /app/dist /usr/share/nginx/html

# nginx:alpine ja traz o usuario nginx; roda sem privilegio de root.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
