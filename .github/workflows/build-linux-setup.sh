#!/bin/bash

apt-get update -y
apt install -y software-properties-common
apt-add-repository -y "ppa:ubuntu-toolchain-r/test"
apt install -y gcc-8 g++-8 autoconf automake build-essential clang cmake execstack fakeroot g++-5 git libc-ares-dev libctemplate-dev curl libglib2.0-dev libgnome-keyring-dev libicu-dev libsasl2-dev libsasl2-modules libsasl2-modules-gssapi-mit libsecret-1-dev libssl-dev libnss3 libnss3-dev libtidy-dev libtool libxext-dev libxkbfile-dev libxml2-dev libxtst-dev rpm uuid-dev xvfb

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

nvm install 16.15.1
nvm alias default 16.15.1

export PATH="$PATH:$(dirname $(nvm which current))"
