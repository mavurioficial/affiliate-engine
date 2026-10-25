CREATE OR REPLACE FUNCTION public.mavuri_cloud_volume_category_refinement()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE t text; target text; extra text[]:=array[]::text[]; cat uuid; market text;
BEGIN
 SELECT slug INTO market FROM public.flow_marketplaces WHERE id=NEW.marketplace_id;
 IF market<>'magalu' THEN RETURN NEW;END IF;
 t:=public.mavuri_normalize_text(NEW.title);
 IF t ~ '(smart tv|televisor|televisao)' THEN target:='eletronicos';extra:=array['eletronicos','tecnologia'];
 ELSIF t ~ '(bicicleta|ergometrica|bola de futebol|bola futebol|bola campo|bola de volei|bola de basquete)' THEN target:='esporte';extra:=array['esporte'];
 ELSIF t ~ '(sabao liquido|sabao em po|amaciante|tira manchas|detergente|limpador multiuso)' AND t !~ '(automotivo|para carro|veicular)' THEN target:='casa';extra:=array['casa','limpeza'];
 ELSIF t ~ '(guarda-roupa|guarda roupa)' THEN target:='casa';extra:=array['casa','moveis'];
 ELSIF t ~ '(ubiquinol|coenzima q10|omega[ -]?3)' THEN target:='saude-bem-estar';extra:=array['bem-estar'];
 ELSIF t ~ '(forma de silicone|aparelho de jantar|jogo de pratos)' THEN target:='cozinha';extra:=array['casa','cozinha'];
 ELSE RETURN NEW;END IF;
 SELECT id INTO cat FROM public.mavuri_categories WHERE slug=target AND active LIMIT 1;
 IF cat IS NULL THEN RETURN NEW;END IF;
 NEW.mavuri_category_id:=cat;
 SELECT array_agg(DISTINCT x) INTO NEW.mavuri_tags FROM unnest(coalesce(NEW.mavuri_tags,array[]::text[])||extra) x;
 NEW.metadata:=jsonb_set(coalesce(NEW.metadata,'{}'::jsonb),'{mavuri}',coalesce(NEW.metadata->'mavuri','{}'::jsonb)||jsonb_build_object('category_slug',target,'tags',to_jsonb(NEW.mavuri_tags),'classification_source','title_identity_refinement'),true);
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.mavuri_cloud_volume_category_refinement() FROM PUBLIC,anon,authenticated;
