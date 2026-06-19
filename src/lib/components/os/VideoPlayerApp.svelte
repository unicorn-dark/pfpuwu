<script lang="ts">
    let { src } = $props();
</script>

<div class="media-player-classic">
    <video {src} controls autoplay></video>
</div>

<style>
    .media-player-classic {
        width: 100%;
        height: 100%;
        background: #000000;
        display: flex;
        justify-content: center;
        align-items: center;
        /* Classic recessed video border */
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        box-sizing: border-box;
    }

    video {
        max-width: 100%;
        max-height: 100%;
        outline: none;
    }
</style>