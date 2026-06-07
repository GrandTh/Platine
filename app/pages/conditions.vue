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
  title: () => (isFr.value ? 'Conditions d\'utilisation — Platine' : 'Terms of Use — Platine'),
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
            Conditions d'utilisation
          </h1>
          <p class="mt-2 text-sm text-white/45">
            Dernière mise à jour : {{ updatedLabel }}
          </p>
        </header>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Acceptation
          </h2>
          <p class="text-white/70">
            En utilisant Platine (<a
              href="https://platine.live"
              class="underline decoration-white/30 hover:text-white"
            >platine.live</a>), vous acceptez les présentes conditions. Si vous n'êtes pas
            d'accord, n'utilisez pas le service.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Description du service
          </h2>
          <p class="text-white/70">
            Platine est une application web gratuite permettant de créer des « rooms » d'écoute
            musicale collaborative à partir de contenus YouTube : ajout de morceaux dans une file
            partagée, votes, et écoute synchronisée en temps réel.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Contenu et lecture YouTube
          </h2>
          <p class="text-white/70">
            Le contenu musical provient de YouTube et est lu via le lecteur officiel YouTube. En
            utilisant Platine, vous acceptez également les
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >Conditions d'utilisation de YouTube</a>.
            Vous êtes responsable du respect de ces conditions.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Utilisation acceptable
          </h2>
          <p class="text-white/70">
            Vous vous engagez à ne pas :
          </p>
          <ul class="list-disc space-y-1 pl-5 text-white/70">
            <li>utiliser le service à des fins illégales ou portant atteinte aux droits de tiers ;</li>
            <li>tenter de contourner les protections, surcharger ou perturber le service ;</li>
            <li>automatiser l'accès au service sans autorisation (scraping, bots, spam) ;</li>
            <li>contourner les limites ou conditions de l'API YouTube.</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Disponibilité
          </h2>
          <p class="text-white/70">
            Le service est fourni « tel quel », gratuitement et sans garantie de disponibilité.
            Nous pouvons le modifier, le suspendre ou l'arrêter à tout moment, sans préavis.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Responsabilité
          </h2>
          <p class="text-white/70">
            Dans les limites permises par la loi, Platine ne peut être tenu responsable des
            dommages résultant de l'utilisation ou de l'impossibilité d'utiliser le service.
            Platine est un projet indépendant, <strong>non affilié à YouTube ou Google</strong>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Propriété intellectuelle
          </h2>
          <p class="text-white/70">
            Les contenus diffusés via YouTube restent la propriété de leurs ayants droit. Le nom,
            le design et l'interface de Platine appartiennent à leur auteur.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Modifications
          </h2>
          <p class="text-white/70">
            Ces conditions peuvent évoluer. La date de dernière mise à jour figure en haut de
            cette page.
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
            Terms of Use
          </h1>
          <p class="mt-2 text-sm text-white/45">
            Last updated: {{ updatedLabel }}
          </p>
        </header>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Acceptance
          </h2>
          <p class="text-white/70">
            By using Platine (<a
              href="https://platine.live"
              class="underline decoration-white/30 hover:text-white"
            >platine.live</a>), you agree to these terms. If you do not agree, please do not use
            the service.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Service description
          </h2>
          <p class="text-white/70">
            Platine is a free web app for creating collaborative music-listening “rooms” based on
            YouTube content: adding tracks to a shared queue, voting, and synced real-time
            listening.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            YouTube content and playback
          </h2>
          <p class="text-white/70">
            Music content comes from YouTube and is played through the official YouTube player. By
            using Platine, you also agree to the
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener"
              class="underline decoration-white/30 hover:text-white"
            >YouTube Terms of Service</a>.
            You are responsible for complying with those terms.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Acceptable use
          </h2>
          <p class="text-white/70">
            You agree not to:
          </p>
          <ul class="list-disc space-y-1 pl-5 text-white/70">
            <li>use the service for unlawful purposes or in violation of third-party rights;</li>
            <li>attempt to circumvent protections, overload or disrupt the service;</li>
            <li>automate access without authorisation (scraping, bots, spam);</li>
            <li>circumvent YouTube API limits or terms.</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Availability
          </h2>
          <p class="text-white/70">
            The service is provided “as is”, free of charge and without any guarantee of
            availability. We may modify, suspend or discontinue it at any time, without notice.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Liability
          </h2>
          <p class="text-white/70">
            To the extent permitted by law, Platine cannot be held liable for damages arising from
            the use of or inability to use the service. Platine is an independent project,
            <strong>not affiliated with YouTube or Google</strong>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Intellectual property
          </h2>
          <p class="text-white/70">
            Content delivered via YouTube remains the property of its rights holders. The name,
            design and interface of Platine belong to its author.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-lg font-semibold">
            Changes
          </h2>
          <p class="text-white/70">
            These terms may change. The last-updated date is shown at the top of this page.
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
