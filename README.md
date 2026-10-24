# APEX — Race Intelligence

Hub de corrida da Fórmula 1: previsões, replay, mapa 3D do traçado, classificação,
perfis de pilotos e um arquivo com todas as temporadas desde 1950.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5177
npm test           # testes de modelo, geometria, preferências e arquivo histórico
npm run build
```

## Login com Google (opcional)

O login usa [Clerk](https://clerk.com). Sem chave, a app funciona em **modo local**:
tema, piloto e equipe favoritos ficam guardados no `localStorage` deste navegador, e
o botão de login fica desativado com uma nota de configuração.

O projeto está ligado à aplicação Clerk **Apex Hub** (instância de desenvolvimento) e
as chaves vivem em `.env.local`, fora do git. Para as recuperar noutra máquina:

```bash
npx clerk@latest auth login              # uma vez, no teu terminal
npx clerk@latest link --app <app_id>
npx clerk@latest env pull                # VITE_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
```

A partir do zero: crie a aplicação em <https://dashboard.clerk.com/apps/new>, ative
**SSO connections → Google** (instâncias `pk_test_…` usam credenciais Google
partilhadas, não é preciso projeto no Google Cloud) e copie a **Publishable key** para
um `.env.local` na raiz:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

O Vite injeta a chave em tempo de build: depois de a mudar, **reconstrua**
(`npm run build`) antes de publicar, senão o site continua em modo local. Só a
publishable key entra no `dist/`; o `CLERK_SECRET_KEY` não é usado no browser.

A build publicada corre numa instância de desenvolvimento — o Clerk avisa em consola
que tem limites de uso e não serve para produção. Para produção é preciso uma
instância própria com o domínio verificado em **Configure → Domains**.

Depois de entrar, o perfil (tema, piloto e equipe favoritos) é gravado em
`user.unsafeMetadata.apex` no Clerk, associado à conta Google. Ao entrar noutro
dispositivo, as preferências são recuperadas. Nome, e-mail e foto vêm da conta Google.
Nenhum segredo do Clerk é usado no cliente.

> A chave publishable é pública por desenho. Não coloque a secret key no projeto.
> `.env` e `.env.local` estão no `.gitignore`.

## Idiomas

A interface está em **português** e **inglês**. O idioma inicial vem de
`navigator.language` e pode ser mudado no menu de perfil (**Idioma**), ficando guardado
em `apex.prefs.v2` e, com sessão iniciada, em `user.unsafeMetadata.apex.lang`.

Os textos vivem em `src/lib/locales/en.ts`, com o português como chave: se faltar uma
tradução, aparece o original em vez de uma chave técnica. `src/lib/language.test.ts`
verifica que os marcadores `{assim}` das chaves e das traduções coincidem.
Biografias e textos de circuito são conteúdo gerado e ficam em português.

## Publicar no GitHub Pages

O repositório inclui `.github/workflows/pages.yml`: cada push para `main` corre
`typecheck`, os testes e o build, e publica `dist/` no GitHub Pages.

1. Crie um repositório **público** (ex.: `apex-f1`) e faça push de `main`.
2. Em **Settings → Pages**, escolha **Build and deployment → GitHub Actions**
   (o workflow também tenta ativar o Pages sozinho).
3. O site fica em `https://<utilizador>.github.io/<repo>/`.

O build do Pages corre com `VITE_BASE=<repo>` para os assets e as fontes apontarem
para `/<repo>/`. A chave publishable do Clerk está em `.env.production` (é pública e
vai para o bundle); substitua-a se mudar de aplicação Clerk. A URL do Pages é um
novo domínio, por isso confirme que a instância do Clerk aceita a origem.

## Arquivo histórico (F1 History)

Os dados ficam em `src/data/history/`, divididos por década e carregados sob demanda:

- `manifest.json` — temporadas, campeões e campeões de construtores;
- `decade-*.json` — classificação completa de cada corrida, volta rápida por piloto
  e volta mais rápida da prova;
- `drivers.json` / `constructors.json` — dicionários de nomes;
- `careers.json` — totais e temporada a temporada de cada piloto.

Para regenerar (usa a API pública Jolpica, sucessora da Ergast, com cache em `.cache/history`):

```bash
npm run data:history
```

A temporada em curso é tratada como **líder do campeonato**, não como campeã, até o
ano seguinte.
