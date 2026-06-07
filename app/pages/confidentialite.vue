<script setup lang="ts">
const { t, locale } = useI18n()
const isFr = computed(() => locale.value === 'fr')

const updated = '2026-06-07'
const updatedLabel = computed(() =>
  new Date(updated).toLocaleDateString(isFr.value ? 'fr-FR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
)

useSeoMeta({
  title: () => (isFr.value ? 'Politique de confidentialité — Platine' : 'Privacy Policy — Platine'),
  robots: 'index, follow'
})
</script>

<template>
  <div class="min-h-dvh bg-[#070510] text-white">
    <div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
      <NuxtLink
        to="/"
        class="mb-8 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('footer.back') }}
      </NuxtLink>

      <!-- ───────────── FR ───────────── -->
      <article
        v-if="isFr"
        class="space-y-6"
      >
        <header>
          <h1 class="font-[Gyanko] text-3xl tracking-wide">
            Politique de confidentialité
          </h1>
          <p class="mt-2 text-sm text-white/45">
            Dernière mise à jour : {{ updatedLabel }}
          </p>
        </header>

        <p class="text-white/70">
          Platine (« nous », « le service »), accessible à l'adresse
          <a
            href="https://platine.live"
            class="underline decoration-white/30 hover:text-white"
          >platine.live</a>,
          est une application web gratuite d'écoute musicale collaborative. La présente
          politique explique quelles données nous traitons et comment.
        </p>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Utilisation des Services API YouTube
          </h2>
          <p class="text-white/70">
            Platine utilise les <strong>Services API YouTube</strong> (« YouTube API Services »)
            pour permettre la recherche et la lecture de vidéos YouTube au sein de l'application.
            En utilisant Platine, vous acceptez d'être lié par les
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >Conditions d'utilisation de YouTube</a>.
            Le traitement de vos données par Google est régi par la
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >Politique de confidentialité de Google</a>.
          </p>
          <p class="text-white/70">
            La lecture des vidéos s'effectue exclusivement via le lecteur intégré officiel de
            YouTube (YouTube IFrame Player). Platine ne télécharge, ne stocke ni ne ré-héberge
            aucun contenu vidéo ou audio. Platine accède uniquement à des données publiques de
            YouTube via une clé API et <strong>n'accède à aucune donnée de votre compte Google</strong>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Données que nous traitons
          </h2>
          <p class="text-white/70">
            Platine fonctionne <strong>sans création de compte</strong>. Nous traitons :
          </p>
          <ul class="list-disc space-y-1 pl-5 text-white/70">
            <li>un identifiant anonyme aléatoire stocké dans votre navigateur (localStorage) pour vous reconnaître au sein d'une room ;</li>
            <li>le pseudonyme que vous choisissez éventuellement ;</li>
            <li>les données des rooms : code de la room, morceaux ajoutés (identifiants de vidéos YouTube et métadonnées d'affichage), votes et réactions ;</li>
            <li>des préférences locales (langue, volume) stockées dans votre navigateur ;</li>
            <li>les informations que vous nous communiquez volontairement si vous nous contactez (par ex. votre adresse e-mail).</li>
          </ul>
          <p class="text-white/70">
            Nous ne collectons ni votre nom réel, ni votre adresse e-mail, ni aucune donnée
            d'identification, sauf si vous nous écrivez.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Finalités
          </h2>
          <p class="text-white/70">
            Ces données servent uniquement à fournir le service : créer et rejoindre des rooms,
            gérer la file partagée et la lecture synchronisée, et afficher les participants.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Hébergement et conservation
          </h2>
          <p class="text-white/70">
            Les données des rooms sont stockées via Supabase (base PostgreSQL) et le service est
            diffusé via Vercel. Les rooms sont <strong>éphémères</strong> : elles sont
            automatiquement supprimées lorsqu'elles deviennent inactives. Les résultats de
            recherche peuvent être mis en cache temporairement afin de limiter les appels à
            l'API YouTube.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Partage des données
          </h2>
          <p class="text-white/70">
            Nous ne vendons pas vos données. Elles sont traitées par nos sous-traitants techniques
            (Supabase pour l'hébergement des données, Vercel pour la diffusion, Google/YouTube pour
            la recherche et la lecture). La lecture des vidéos implique une communication directe
            entre votre navigateur et YouTube/Google.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Cookies et stockage local
          </h2>
          <p class="text-white/70">
            Platine utilise le stockage local de votre navigateur (identifiant anonyme, pseudo,
            langue, volume) et un cookie de préférence de langue. Platine n'utilise aucun cookie
            publicitaire ni de pistage. Le lecteur YouTube intégré peut, lui, déposer ses propres
            cookies, régis par Google.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Vos droits
          </h2>
          <p class="text-white/70">
            Conformément au RGPD, vous disposez de droits d'accès, de rectification et de
            suppression. L'essentiel de vos données étant anonyme et stocké localement, vous pouvez
            les effacer en vidant le stockage local de votre navigateur. Vous pouvez également gérer
            les autorisations liées à votre compte Google depuis vos
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >paramètres de sécurité Google</a>.
            Pour toute demande, contactez-nous (voir ci-dessous).
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Enfants
          </h2>
          <p class="text-white/70">
            Le service n'est pas destiné aux enfants de moins de 13 ans (ou de l'âge minimum
            applicable dans votre pays).
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Modifications
          </h2>
          <p class="text-white/70">
            Nous pouvons mettre à jour cette politique. La date de dernière mise à jour figure en
            haut de cette page.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Contact
          </h2>
          <p class="text-white/70">
            Pour toute question :
            <a
              href="mailto:support@platine.live"
              class="underline decoration-white/30 hover:text-white"
            >support@platine.live</a>.
          </p>
        </section>
      </article>

      <!-- ───────────── EN ───────────── -->
      <article
        v-else
        class="space-y-6"
      >
        <header>
          <h1 class="font-[Gyanko] text-3xl tracking-wide">
            Privacy Policy
          </h1>
          <p class="mt-2 text-sm text-white/45">
            Last updated: {{ updatedLabel }}
          </p>
        </header>

        <p class="text-white/70">
          Platine (“we”, “the service”), available at
          <a
            href="https://platine.live"
            class="underline decoration-white/30 hover:text-white"
          >platine.live</a>,
          is a free collaborative music-listening web app. This policy explains what data we
          process and how.
        </p>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Use of YouTube API Services
          </h2>
          <p class="text-white/70">
            Platine uses <strong>YouTube API Services</strong> to let users search for and play
            YouTube videos within the app. By using Platine, you agree to be bound by the
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >YouTube Terms of Service</a>.
            Google's handling of your data is governed by the
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >Google Privacy Policy</a>.
          </p>
          <p class="text-white/70">
            Playback happens exclusively through the official embedded YouTube player (YouTube
            IFrame Player). Platine does not download, store or re-host any video or audio content.
            Platine only accesses public YouTube data via an API key and
            <strong>does not access any data from your Google account</strong>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Data we process
          </h2>
          <p class="text-white/70">
            Platine works <strong>without any account</strong>. We process:
          </p>
          <ul class="list-disc space-y-1 pl-5 text-white/70">
            <li>a random anonymous identifier stored in your browser (localStorage) to recognise you within a room;</li>
            <li>the nickname you optionally choose;</li>
            <li>room data: room code, added tracks (YouTube video IDs and display metadata), votes and reactions;</li>
            <li>local preferences (language, volume) stored in your browser;</li>
            <li>any information you voluntarily provide if you contact us (e.g. your email address).</li>
          </ul>
          <p class="text-white/70">
            We do not collect your real name, email address or any identifying data unless you
            reach out to us.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Purposes
          </h2>
          <p class="text-white/70">
            This data is used solely to provide the service: creating and joining rooms, managing
            the shared queue and synced playback, and displaying participants.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Hosting and retention
          </h2>
          <p class="text-white/70">
            Room data is stored via Supabase (PostgreSQL database) and the service is served via
            Vercel. Rooms are <strong>ephemeral</strong>: they are automatically deleted once they
            become inactive. Search results may be cached temporarily to limit calls to the YouTube
            API.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Data sharing
          </h2>
          <p class="text-white/70">
            We do not sell your data. It is processed by our technical providers (Supabase for data
            hosting, Vercel for delivery, Google/YouTube for search and playback). Video playback
            involves direct communication between your browser and YouTube/Google.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Cookies and local storage
          </h2>
          <p class="text-white/70">
            Platine uses your browser's local storage (anonymous identifier, nickname, language,
            volume) and a language-preference cookie. Platine uses no advertising or tracking
            cookies. The embedded YouTube player may set its own cookies, governed by Google.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Your rights
          </h2>
          <p class="text-white/70">
            Under the GDPR, you have rights of access, rectification and erasure. As most of your
            data is anonymous and stored locally, you can erase it by clearing your browser's local
            storage. You can also manage permissions tied to your Google account from your
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >Google security settings</a>.
            For any request, contact us (see below).
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Children
          </h2>
          <p class="text-white/70">
            The service is not intended for children under 13 (or the minimum age applicable in
            your country).
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Changes
          </h2>
          <p class="text-white/70">
            We may update this policy. The last-updated date is shown at the top of this page.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Contact
          </h2>
          <p class="text-white/70">
            For any question:
            <a
              href="mailto:support@platine.live"
              class="underline decoration-white/30 hover:text-white"
            >support@platine.live</a>.
          </p>
        </section>
      </article>
    </div>
  </div>
</template>
