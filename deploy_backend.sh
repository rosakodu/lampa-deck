#!/bin/bash
rsync -avz -e 'ssh' main.py deck@192.168.0.196:/home/deck/homebrew/plugins/lampa-deck/main.py
ssh deck@192.168.0.196 'echo 0451 | sudo -S systemctl restart plugin_loader'
