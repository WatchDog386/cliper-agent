-- The timed words of a clip's transcript, for .srt / .vtt subtitle export
ALTER TABLE "Clip" ADD COLUMN "words" JSONB;
