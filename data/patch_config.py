#!/usr/bin/env python3
"""
Script per patchare la configurazione di Valhalla
Modifica il file valhalla.json per adattarlo all'ambiente container
"""

import json
import sys
import os

def patch_valhalla_config():
    """Applica le patch necessarie alla configurazione di Valhalla"""
    
    config_file = '/data/valhalla.json'
    output_file = '/data/valhalla.generated.json'
    
    try:
        # Leggi la configurazione base
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        # Applica le patch per l'ambiente container
        patches = [
            # Assicura che i percorsi siano corretti per il container
            ('mjolnir.tile_dir', '/data/valhalla_tiles'),
            ('mjolnir.tile_extract', '/data/valhalla_tiles.tar'),
            ('mjolnir.admin', '/data/admins.sqlite'),
            ('mjolnir.timezone', '/data/timezones.sqlite'),
            ('additional_data.elevation', '/data/valhalla/elevation/'),
            ('httpd.service.listen', 'tcp://*:8002'),
        ]
        
        for key_path, value in patches:
            keys = key_path.split('.')
            current = config
            
            # Naviga nella struttura JSON
            for key in keys[:-1]:
                if key not in current:
                    current[key] = {}
                current = current[key]
            
            # Imposta il valore finale
            current[keys[-1]] = value
        
        # Assicura che le directory necessarie esistano
        os.makedirs('/data/valhalla_tiles', exist_ok=True)
        os.makedirs('/data/valhalla/elevation', exist_ok=True)
        
        # Scrivi la configurazione patchata
        with open(output_file, 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"Configurazione Valhalla patchata con successo")
        print(f"Input: {config_file}")
        print(f"Output: {output_file}")
        
        return True
        
    except FileNotFoundError:
        print(f"ERRORE: File di configurazione non trovato: {config_file}")
        return False
    except json.JSONDecodeError as e:
        print(f"ERRORE: JSON non valido in {config_file}: {e}")
        return False
    except Exception as e:
        print(f"ERRORE: Durante il patch della configurazione: {e}")
        return False

if __name__ == '__main__':
    success = patch_valhalla_config()
    sys.exit(0 if success else 1)
