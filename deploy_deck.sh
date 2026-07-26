#!/bin/bash
ssh deck@192.168.0.196 'mkdir -p /home/deck/tmp'
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='.pnpm-store' -e 'ssh' . deck@192.168.0.196:/home/deck/tmp/lampa-deck-tmp
ssh deck@192.168.0.196 'echo 0451 | sudo -S bash -c "rm -rf /home/deck/homebrew/plugins/lampa-deck && mv /home/deck/tmp/lampa-deck-tmp /home/deck/homebrew/plugins/lampa-deck && chown -R deck:deck /home/deck/homebrew/plugins/lampa-deck && systemctl restart plugin_loader"'
